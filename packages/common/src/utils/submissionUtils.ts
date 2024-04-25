import { parallel } from '@overturebio-stack/lectern-client';
import {
	DataRecord,
	SchemaValidationError,
	SchemasDictionary,
	TypedDataRecord,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import * as _ from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { NewSubmission, Submission } from '../models/submissions.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import dictionaryUtils from './dictionaryUtils.js';
import { InternalServerError } from './errors.js';
import { readHeaders } from './fileUtils.js';
import { isNumber } from './formatUtils.js';
import {
	ActiveSubmissionResponse,
	ActiveSubmissionSummaryRepository,
	ActiveSubmissionSummaryResponse,
	BATCH_ERROR_TYPE,
	BatchError,
	CategoryActiveSubmission,
	DataActiveSubmissionSummary,
	DictionaryActiveSubmission,
	SUBMISSION_STATE,
	SubmissionEntity,
} from './types.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_UTILS';
	const { logger } = dependencies;
	const submissionRepo = submissionRepository(dependencies);
	return {
		/**
		 * Creates a new Active Submission in database or update if already exists
		 * @param {number | undefined} idActiveSubmission ID of the Active Submission if already exists
		 * @param {Record<string, SubmissionEntity>} entityMap Map of Entities with Entity Types as keys
		 * @param {string} categoryId The category ID of the Submission
		 * @param {Record<string, SchemaValidationError[]>} schemaErrors Array of schemaErrors
		 * @param {number} dictionaryId The Dictionary ID of the Submission
		 * @param {string} userName User creating/updating the active submission
		 * @returns An Active Submission created or updated
		 */
		createOrUpdateActiveSubmission: async (
			idActiveSubmission: number | undefined,
			entityMap: Record<string, SubmissionEntity>,
			categoryId: string,
			schemaErrors: Record<string, SchemaValidationError[]>,
			dictionaryId: number,
			userName: string,
			organization: string,
		): Promise<Submission> => {
			let updatedSubmission: Submission;
			const newStateSubmission =
				Object.keys(schemaErrors).length > 0 ? SUBMISSION_STATE.INVALID : SUBMISSION_STATE.VALID;
			if (isNumber(idActiveSubmission)) {
				// Update with new data
				const resultUpdate = await submissionRepo.update(_.toNumber(idActiveSubmission), {
					data: entityMap,
					state: newStateSubmission,
					organization,
					dictionaryId,
					updatedBy: userName,
					errors: schemaErrors,
				});
				if (!resultUpdate) throw new InternalServerError();

				updatedSubmission = resultUpdate;

				logger.info(
					LOG_MODULE,
					`Updated Active submission '${updatedSubmission.id}' for category '${updatedSubmission.dictionaryCategoryId}'`,
				);
			} else {
				const newSubmission: NewSubmission = {
					state: newStateSubmission,
					dictionaryCategoryId: Number(categoryId),
					organization,
					data: entityMap,
					errors: schemaErrors,
					dictionaryId: dictionaryId,
					createdBy: userName,
				};

				updatedSubmission = await submissionRepo.save(newSubmission);
				logger.info(LOG_MODULE, `Created a new Active submission for category '${categoryId}'`);
			}
			return updatedSubmission;
		},

		/**
		 * Removes invalid/duplicated files
		 * @param {Express.Multer.File[]} files An array of files
		 * @param {string[]} dictionarySchemaNames Schema names in the dictionary
		 * @returns A list of valid files mapped by schema/entity names
		 */
		checkFileNames: async (
			files: Express.Multer.File[],
			dictionarySchemaNames: string[],
		): Promise<{ validFileEntity: Record<string, Express.Multer.File>; batchErrors: BatchError[] }> => {
			const validFileEntity: Record<string, Express.Multer.File> = {};
			const batchErrors: BatchError[] = [];

			for (const file of files) {
				const matchingName = dictionarySchemaNames.filter(
					(schemaName) => schemaName.toLowerCase() == file.originalname.split('.')[0].toLowerCase(),
				);

				if (matchingName.length > 1) {
					logger.error(LOG_MODULE, `Duplicated schema for file name '${file.originalname}'`);
					batchErrors.push({
						type: BATCH_ERROR_TYPE.MULTIPLE_TYPED_FILES,
						message: 'Multiple schemas matches this file',
						batchName: file.originalname,
					});
				} else if (matchingName.length === 1) {
					logger.debug(LOG_MODULE, `Mapping a valid schema name '${matchingName[0]}' for file '${file.originalname}'`);
					validFileEntity[matchingName[0]] = file;
				} else {
					logger.error(LOG_MODULE, `No schema found for file name '${file.originalname}'`);
					batchErrors.push({
						type: BATCH_ERROR_TYPE.INVALID_FILE_NAME,
						message: 'Filename does not relate any schema name',
						batchName: file.originalname,
					});
				}
			}

			if (_.isEmpty(validFileEntity)) {
				logger.info(LOG_MODULE, `No valid files for submission`);
			}

			return {
				validFileEntity,
				batchErrors,
			};
		},

		/**
		 * Run Schema Validation process
		 * @param {SchemasDictionary} dictionary The dictionary to validate data with
		 * @param {string} entityName The entity Name
		 * @param {ReadonlyArray<DataRecord>} records An Array of the records to validate
		 * @returns The result of the Schema validation
		 */
		processSchemaValidation: async (
			dictionary: SchemasDictionary,
			entityName: string,
			records: ReadonlyArray<DataRecord>,
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
				`Validation completed for entity '${entityName}' with '${_.flatten(schemaErrors).length}' errors`,
			);

			return {
				processedRecords: validRecords,
				schemaErrors: _.flatten(schemaErrors),
			};
		},

		/**
		 * Checks if file contains required fields based on schema
		 * @param {SchemasDictionary} dictionary A dictionary to validate with
		 * @param {Record<string, Express.Multer.File>} entityFileMap A Record to map a file with a entityName as a key
		 * @returns a list of valid files and a list of errors
		 */
		checkEntityFieldNames: async (
			dictionary: SchemasDictionary,
			entityFileMap: Record<string, Express.Multer.File>,
		) => {
			const { getSchemaFieldNames } = dictionaryUtils(dependencies);
			const checkedEntities: Record<string, Express.Multer.File> = {};
			const fieldNameErrors: BatchError[] = [];

			for (const [entityName, file] of Object.entries(entityFileMap)) {
				const fileHeaders = await readHeaders(file);

				const schemaFieldNames = await getSchemaFieldNames(dictionary, entityName);

				const missingRequiredFields = schemaFieldNames.required.filter(
					(requiredField) => !fileHeaders.includes(requiredField),
				);
				if (missingRequiredFields.length > 0) {
					logger.error(
						LOG_MODULE,
						`Missing required fields '${JSON.stringify(missingRequiredFields)}' on batch named '${file.originalname}'`,
					);
					fieldNameErrors.push({
						type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
						message: `Missing required fields '${JSON.stringify(missingRequiredFields)}'`,
						batchName: file.originalname,
					});
				} else {
					checkedEntities[entityName] = file;
				}
			}
			return {
				checkedEntities,
				fieldNameErrors,
			};
		},

		parseActiveSubmissionSummaryResponse: (
			submission: ActiveSubmissionSummaryRepository,
		): ActiveSubmissionSummaryResponse => {
			let dataSummary = Object.entries(submission.data).reduce(
				(acc, [entityName, entityData]) => {
					acc[entityName] = { ..._.omit(entityData, 'records'), recordsCount: entityData.records.length };
					return acc;
				},
				{} as Record<string, DataActiveSubmissionSummary>,
			);

			return {
				id: submission.id,
				data: dataSummary,
				dictionary: submission.dictionary as DictionaryActiveSubmission,
				dictionaryCategory: submission.dictionaryCategory as CategoryActiveSubmission,
				errors: submission.errors,
				organization: _.toString(submission.organization),
				state: submission.state,
				createdAt: _.toString(submission.createdAt?.toISOString()),
				createdBy: _.toString(submission.createdBy),
				updatedAt: _.toString(submission.updatedAt?.toISOString()),
				updatedBy: _.toString(submission.updatedBy),
			};
		},

		parseActiveSubmissionResponse: (submission: ActiveSubmissionSummaryRepository): ActiveSubmissionResponse => {
			return {
				id: submission.id,
				data: submission.data,
				dictionary: submission.dictionary as DictionaryActiveSubmission,
				dictionaryCategory: submission.dictionaryCategory as CategoryActiveSubmission,
				errors: submission.errors,
				organization: _.toString(submission.organization),
				state: submission.state,
				createdAt: _.toString(submission.createdAt?.toISOString()),
				createdBy: _.toString(submission.createdBy),
				updatedAt: _.toString(submission.updatedAt?.toISOString()),
				updatedBy: _.toString(submission.updatedBy),
			};
		},
	};
};

export default utils;
