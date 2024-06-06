import {
	SchemaData,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import * as _ from 'lodash-es';

import { NewSubmission, Submission, SubmissionData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import dictionaryUtils from './dictionaryUtils.js';
import { InternalServerError } from './errors.js';
import { readHeaders, tsvToJson } from './fileUtils.js';
import { isNumber } from './formatUtils.js';
import {
	ActiveSubmissionResponse,
	ActiveSubmissionSummaryRepository,
	ActiveSubmissionSummaryResponse,
	BATCH_ERROR_TYPE,
	BatchError,
	CategoryActiveSubmission,
	DataActiveSubmissionSummary,
	DataRecordReference,
	DictionaryActiveSubmission,
	MERGE_REFERENCE_TYPE,
	SUBMISSION_STATUS,
	SubmissionReference,
	SubmissionStatus,
	SubmittedDataReference,
} from './types.js';

const utils = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_UTILS';
	const { logger } = dependencies;

	// Only "open", "valid", and "invalid" statuses are considered Active Submission
	const statusesAllowedToClose = [SUBMISSION_STATUS.OPEN, SUBMISSION_STATUS.VALID, SUBMISSION_STATUS.INVALID] as const;
	type StatusesAllowedToClose = typeof statusesAllowedToClose extends Array<infer T> ? T : never;

	const submissionRepo = submissionRepository(dependencies);
	return {
		/** Determines if a Submission can be closed based on it's current status
		 * @param {SubmissionStatus} status Status of a Submission
		 * @returns {boolean}
		 */
		canTransitionToClosed: (status: SubmissionStatus): status is StatusesAllowedToClose => {
			const openStatuses: SubmissionStatus[] = [...statusesAllowedToClose];
			return openStatuses.includes(status);
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
		 * Creates a new Active Submission in database or update if already exists
		 * @param {number | undefined} idActiveSubmission ID of the Active Submission if already exists
		 * @param {Record<string, SubmissionData>} entityMap Map of Entities with Entity Types as keys
		 * @param {string} categoryId The category ID of the Submission
		 * @param {Record<string, SchemaValidationError[]>} schemaErrors Array of schemaErrors
		 * @param {number} dictionaryId The Dictionary ID of the Submission
		 * @param {string} userName User creating/updating the active submission
		 * @returns An Active Submission created or updated
		 */
		createOrUpdateActiveSubmission: async (inputActiveSubmission: {
			idActiveSubmission: number | undefined;
			entityMap: Record<string, SubmissionData>;
			categoryId: string;
			schemaErrors: Record<string, SchemaValidationError[]>;
			dictionaryId: number;
			userName: string;
			organization: string;
		}): Promise<Submission> => {
			let updatedSubmission: Submission;
			const newStatusSubmission =
				Object.keys(inputActiveSubmission.schemaErrors).length > 0
					? SUBMISSION_STATUS.INVALID
					: SUBMISSION_STATUS.VALID;
			if (isNumber(inputActiveSubmission.idActiveSubmission)) {
				// Update with new data
				const resultUpdate = await submissionRepo.update(_.toNumber(inputActiveSubmission.idActiveSubmission), {
					data: inputActiveSubmission.entityMap,
					status: newStatusSubmission,
					organization: inputActiveSubmission.organization,
					dictionaryId: inputActiveSubmission.dictionaryId,
					updatedBy: inputActiveSubmission.userName,
					errors: inputActiveSubmission.schemaErrors,
				});
				if (!resultUpdate) {
					throw new InternalServerError();
				}

				updatedSubmission = resultUpdate;

				logger.info(
					LOG_MODULE,
					`Updated Active submission '${updatedSubmission.id}' for category '${updatedSubmission.dictionaryCategoryId}'`,
				);
			} else {
				const newSubmission: NewSubmission = {
					status: newStatusSubmission,
					dictionaryCategoryId: Number(inputActiveSubmission.categoryId),
					organization: inputActiveSubmission.organization,
					data: inputActiveSubmission.entityMap,
					errors: inputActiveSubmission.schemaErrors,
					dictionaryId: inputActiveSubmission.dictionaryId,
					createdBy: inputActiveSubmission.userName,
				};

				updatedSubmission = await submissionRepo.save(newSubmission);
				logger.info(LOG_MODULE, `Created a new Active submission for category '${inputActiveSubmission.categoryId}'`);
			}
			return updatedSubmission;
		},

		/**
		 * Checks if object is a Submission or a SubmittedData
		 * @param {SubmittedDataReference | SubmissionReference} toBeDetermined
		 * @returns {boolean}
		 */
		determineIfIsSubmission: (
			toBeDetermined: SubmittedDataReference | SubmissionReference,
		): toBeDetermined is SubmissionReference => {
			return (toBeDetermined as SubmissionReference).type === MERGE_REFERENCE_TYPE.SUBMISSION;
		},

		/**
		 * Creates a Record type of SchemaData grouped by Entity names
		 * @param {Record<string, DataRecordReference[]>} mergeDataRecordsByEntityName
		 * @returns {Record<string, SchemaData>}
		 */
		extractSchemaDataFromMergedDataRecords: (
			mergeDataRecordsByEntityName: Record<string, DataRecordReference[]>,
		): Record<string, SchemaData> => {
			return _.mapValues(mergeDataRecordsByEntityName, (mappingArray) => mappingArray.map((o) => o.dataRecord));
		},

		/**
		 * This function extracts the Schema Data from the Active Submission
		 * and maps it to it's original reference Id
		 * The result mapping is used to perform the cross schema validation
		 * @param {number | undefined} activeSubmissionId
		 * @param {Record<string, SubmissionData>} activeSubmissionDataEntities
		 * @returns {Record<string, DataRecordReference[]>}
		 */
		mapSubmissionSchemaDataByEntityName: (
			activeSubmissionId: number | undefined,
			activeSubmissionDataEntities: Record<string, SubmissionData>,
		): Record<string, DataRecordReference[]> => {
			return _.mapValues(activeSubmissionDataEntities, (submissionData) =>
				submissionData.records.map((record, index) => {
					return {
						dataRecord: record,
						reference: {
							submissionId: activeSubmissionId,
							type: MERGE_REFERENCE_TYPE.SUBMISSION,
							index: index,
						} as SubmissionReference,
					};
				}),
			);
		},

		/**
		 * Utility to parse a raw Active Submission to a Response type
		 * @param {ActiveSubmissionSummaryRepository} submission
		 * @returns {ActiveSubmissionResponse}
		 */
		parseActiveSubmissionResponse: (submission: ActiveSubmissionSummaryRepository): ActiveSubmissionResponse => {
			return {
				id: submission.id,
				data: submission.data,
				dictionary: submission.dictionary as DictionaryActiveSubmission,
				dictionaryCategory: submission.dictionaryCategory as CategoryActiveSubmission,
				errors: submission.errors,
				organization: _.toString(submission.organization),
				status: submission.status,
				createdAt: _.toString(submission.createdAt?.toISOString()),
				createdBy: _.toString(submission.createdBy),
				updatedAt: _.toString(submission.updatedAt?.toISOString()),
				updatedBy: _.toString(submission.updatedBy),
			};
		},

		/**
		 * Utility to parse a raw Active Submission to a Summary of the Active Submission
		 * @param {ActiveSubmissionSummaryRepository} submission
		 * @returns {ActiveSubmissionSummaryResponse}
		 */
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
				status: submission.status,
				createdAt: _.toString(submission.createdAt?.toISOString()),
				createdBy: _.toString(submission.createdBy),
				updatedAt: _.toString(submission.updatedAt?.toISOString()),
				updatedBy: _.toString(submission.updatedBy),
			};
		},

		removeEntityFromSubmission: (submissionData: Record<string, SubmissionData>, entityName: string) => {
			return _.omit(submissionData, entityName);
		},

		/**
		 * Construct a SubmissionData object per each file returning a Record type based on entityName
		 * @param {Record<string, Express.Multer.File>} files
		 * @param {string} userName
		 * @returns {Promise<Record<string, SubmissionData>>}
		 */
		submissionEntitiesFromFiles: async (
			files: Record<string, Express.Multer.File>,
			userName: string,
		): Promise<Record<string, SubmissionData>> => {
			const filesDataProcessed: Record<string, SubmissionData> = {};
			await Promise.all(
				Object.entries(files).map(async ([entityName, file]) => {
					const parsedFileData = await tsvToJson(file.path);
					filesDataProcessed[entityName] = {
						batchName: file.originalname,
						creator: userName,
						records: parsedFileData,
					} as SubmissionData;
				}),
			);
			return filesDataProcessed;
		},
	};
};

export default utils;
