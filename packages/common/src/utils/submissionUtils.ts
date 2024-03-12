import { parallel } from '@overturebio-stack/lectern-client';
import { and, eq, or } from 'drizzle-orm';
import { flatten, isEmpty } from 'lodash-es';

import {
	SchemaValidationError,
	SchemasDictionary,
	TypedDataRecord,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import { NewSubmission, Submission, submissions } from '../models/submissions.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import dictionaryUtils from './dictionaryUtils.js';
import { TsvRecordAsJsonObj } from './fileUtils.js';
import { BATCH_ERROR_TYPE, BatchError, CreateActiveSubmission, SUBMISSION_STATE, SubmissionEntity } from './types.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_UTILS';
	const { logger } = dependencies;
	const submissionRepo = submissionRepository(dependencies);
	return {
		/**
		 * Creates a new Active Submission in database or update if already exists
		 * @param {Record<string, SubmissionEntity>} entityMap Map of Entities with Entity Types as keys
		 * @param {string} categoryId The category ID of the Submission
		 * @param {BatchError[]} batchErrors Array of BatchErrors
		 * @param {number} dictionaryId The Dictionary ID of the Submission
		 * @returns An Active Submission created or updated
		 */
		createOrUpdateActiveSubmission: async (
			entityMap: Record<string, SubmissionEntity>,
			categoryId: string,
			batchErrors: BatchError[],
			dictionaryId: number,
			createdBy: string,
		): Promise<Submission> => {
			const foundOpenSubmission = await utils(dependencies).getCurrentActiveSubmission(Number(categoryId));
			let updatedSubmission: Submission;
			if (!isEmpty(foundOpenSubmission)) {
				const { id, data } = foundOpenSubmission[0];
				const currentSubmissionId = Number(id);
				const currentData = data as Record<string, SubmissionEntity>;
				logger.debug(LOG_MODULE, `Found an Active submission`, JSON.stringify(currentData));

				// merge current active submission data
				const newData = { ...currentData, ...entityMap };

				// Update with new data
				foundOpenSubmission[0].data = newData;

				const updatedRecord = await submissionRepo.update(
					foundOpenSubmission[0],
					eq(submissions.id, currentSubmissionId),
				);
				updatedSubmission = updatedRecord[0];
				logger.info(
					LOG_MODULE,
					`Updated Active submission '${updatedSubmission.id}' for category '${updatedSubmission.dictionaryCategoryId}'`,
				);
			} else {
				const newSubmission: NewSubmission = {
					state: SUBMISSION_STATE.OPEN,
					dictionaryCategoryId: Number(categoryId),
					data: entityMap,
					errors: batchErrors,
					dictionaryId: dictionaryId,
					createdBy,
				};

				updatedSubmission = await submissionRepo.save(newSubmission);
				logger.info(LOG_MODULE, `Created a new Active submission for category '${categoryId}'`);
			}
			return updatedSubmission;
		},

		/**
		 * Gets the current 'open' active submission based on Category ID
		 * @param {number} categoryId A Category ID
		 * @returns An Active Submission
		 */
		getCurrentActiveSubmission: async (categoryId: number) => {
			return await submissionRepo.select(
				{},
				and(
					eq(submissions.dictionaryCategoryId, categoryId),
					or(eq(submissions.state, 'OPEN'), eq(submissions.state, 'VALID'), eq(submissions.state, 'INVALID')),
				),
			);
		},

		/**
		 * Removes invalid/duplicated Entity names.
		 * Converts an Array of SubmissionEntity into a Record type with Entity Name as key
		 * @param {SubmissionEntity[]} entitiesArray An array of Submission Entities
		 * @param {string[]} dictionarySchemaNames Schema names in the dictionary
		 * @returns A Record type of SubmissionEntities with Entity names as key, and an array of errors found
		 */
		mappingEntities: async (
			entitiesArray: SubmissionEntity[],
			dictionarySchemaNames: string[],
		): Promise<{ entityMap: Record<string, SubmissionEntity>; mappingError: Array<BatchError> }> => {
			const entityMap: Record<string, SubmissionEntity> = {};
			const mappingError: Array<BatchError> = [];

			//find duplicates
			for (const schemasNames of dictionarySchemaNames) {
				const filteredValidEntities = entitiesArray.filter(
					(entities) => entities.batchName.split('.')[0].toLowerCase() == schemasNames.toLowerCase(),
				);

				if (filteredValidEntities.length > 1) {
					logger.error(LOG_MODULE, `Duplicated schema name '${schemasNames}'`);
					mappingError.push({
						batchName: schemasNames,
						message: '',
						type: BATCH_ERROR_TYPE.MULTIPLE_TYPED_FILES,
					});
				} else if (filteredValidEntities.length == 1) {
					logger.debug(LOG_MODULE, `Mapping a valid schema name '${schemasNames}'`);
					entityMap[schemasNames] = filteredValidEntities[0];
				}
			}

			if (isEmpty(entityMap)) {
				logger.info(LOG_MODULE, `No valid Entities on submission`);
			}

			return {
				entityMap,
				mappingError,
			};
		},
		/**
		 * Run Schema Validation process
		 * @param {SchemasDictionary} dictionary The dictionary to validate data with
		 * @param {string} entityName The entity Name
		 * @param {ReadonlyArray<TsvRecordAsJsonObj>} records An Array of the records to validate
		 * @returns The result of the Schema validation
		 */
		processSchemaValidation: async (
			dictionary: SchemasDictionary,
			entityName: string,
			records: ReadonlyArray<TsvRecordAsJsonObj>,
		): Promise<{ processedRecords: TypedDataRecord[]; schemaErrors: SchemaValidationError[] }> => {
			const validRecords: any[] = [];
			const schemaErrors: any[] = [];

			logger.debug(LOG_MODULE, `Initiate validation for entity '${entityName}' with '${records.length}' records`);

			// Process all records async and wait for all of them to finish
			await Promise.all(
				records.map(async (record, index) => {
					logger.debug(LOG_MODULE, `Parallel processing record index '${index}' of entity '${entityName}'`);
					const { processedRecord, validationErrors } = await parallel.processRecord(
						dictionary,
						entityName,
						record,
						index,
					);

					// Respect the order of the records
					validRecords[index] = processedRecord;
					schemaErrors[index] = validationErrors;

					if (validationErrors.length > 0) {
						logger.error(
							LOG_MODULE,
							`Found '${validationErrors.length}' errors on record index '${index}' of entity '${entityName}'`,
						);
					}
				}),
			);

			logger.info(
				LOG_MODULE,
				`Validation completed for entity '${entityName}' with '${flatten(schemaErrors).length}' errors`,
			);

			return {
				processedRecords: validRecords,
				schemaErrors: flatten(schemaErrors),
			};
		},

		/**
		 *
		 * @param dictionary
		 * @param submissionEntityMap
		 * @returns
		 */
		checkEntityFieldNames: async (
			dictionary: SchemasDictionary,
			submissionEntityMap: Record<string, SubmissionEntity>,
		) => {
			const { getSchemaFieldNames } = dictionaryUtils(dependencies);
			const checkedEntities: Record<string, SubmissionEntity> = {};
			const fieldNameErrors: BatchError[] = [];

			Object.entries(submissionEntityMap).map(async ([entityName, submissionEntity]) => {
				const submissionFieldNames = new Set(Object.keys(submissionEntity.records[0]));

				const schemaFieldNames = await getSchemaFieldNames(dictionary, entityName);

				const missingRequiredFields = schemaFieldNames.required.filter(
					(requiredField) => !submissionFieldNames.has(requiredField),
				);
				if (missingRequiredFields.length > 0) {
					logger.error(
						LOG_MODULE,
						`Missing required fields '${JSON.stringify(missingRequiredFields)}' on batch named '${submissionEntity.batchName}'`,
					);
					fieldNameErrors.push({
						batchName: submissionEntity.batchName,
						message: `Missing required fields '${JSON.stringify(missingRequiredFields)}'`,
						type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
					});
				} else {
					checkedEntities[entityName] = submissionEntity;
				}
			});
			return {
				checkedEntities,
				fieldNameErrors,
			};
		},
	};
};

/**
 * Converts a 'Submission' to a 'CreateActiveSubmission' type or it's defaults
 * @param {Submission} submission
 * @returns a Submission of type 'CreateActiveSubmission'
 */
export const parseToResultSubmission = (submission?: Submission): CreateActiveSubmission => {
	return {
		id: submission?.id.toString(),
		categoryId: submission?.dictionaryCategoryId?.toString() || '',
		entities: (submission?.data as Record<string, SubmissionEntity>) || {},
		state: submission?.state?.toString() || '',
		createdAt: submission?.createdAt?.toISOString(),
		createdBy: '', // TODO: Auth not implemented yet.
	};
};

export default utils;
