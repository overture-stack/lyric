import * as _ from 'lodash-es';

import { NewSubmission, Submission, SubmissionData, type SubmissionInsertData } from '@overture-stack/lyric-data-model';
import {
	SchemaData,
	SchemasDictionary,
	SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryUtils from './dictionaryUtils.js';
import { InternalServerError } from './errors.js';
import { readHeaders, tsvToJson } from './fileUtils.js';
import {
	ActiveSubmissionResponse,
	ActiveSubmissionSummaryRepository,
	ActiveSubmissionSummaryResponse,
	BATCH_ERROR_TYPE,
	BatchError,
	CategoryActiveSubmission,
	type DataDeletesActiveSubmissionSummary,
	DataInsertsActiveSubmissionSummary,
	DataRecordReference,
	type DataUpdatesActiveSubmissionSummary,
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
		 * Find the current Active Submission or Create an Open Active Submission with initial values and no schema data.
		 * @param {object} params
		 * @param {string} params.userName Owner of the Submission
		 * @param {number} params.categoryId Category ID of the Submission
		 * @param {string} params.organization Organization name
		 * @returns {Submission} An Active Submission
		 */
		getOrCreateActiveSubmission: async (params: {
			userName: string;
			categoryId: number;
			organization: string;
		}): Promise<Submission> => {
			const { categoryId, userName, organization } = params;
			const submissionRepo = submissionRepository(dependencies);
			const categoryRepo = categoryRepository(dependencies);

			const activeSubmission = await submissionRepo.getActiveSubmission({ categoryId, userName, organization });
			if (activeSubmission) {
				return activeSubmission;
			}

			const currentDictionary = await categoryRepo.getActiveDictionaryByCategory(categoryId);

			if (!currentDictionary) {
				throw new InternalServerError(`Dictionary in category '${categoryId}' not found`);
			}

			const newSubmissionInput: NewSubmission = {
				createdBy: userName,
				data: {},
				dictionaryCategoryId: categoryId,
				dictionaryId: currentDictionary.id,
				errors: {},
				organization: organization,
				status: SUBMISSION_STATUS.OPEN,
			};

			return submissionRepo.save(newSubmissionInput);
		},

		/**
		 * This function extracts the Schema Data from the Active Submission
		 * and maps it to it's original reference Id
		 * The result mapping is used to perform the cross schema validation
		 * @param {number | undefined} activeSubmissionId
		 * @param {Record<string, SubmissionInsertData>} activeSubmissionInsertDataEntities
		 * @returns {Record<string, DataRecordReference[]>}
		 */
		mapSubmissionSchemaDataByEntityName: (
			activeSubmissionId: number | undefined,
			activeSubmissionInsertDataEntities: Record<string, SubmissionInsertData>,
		): Record<string, DataRecordReference[]> => {
			return _.mapValues(activeSubmissionInsertDataEntities, (submissionInsertData) =>
				submissionInsertData.records.map((record, index) => {
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
			const dataInsertsSummary =
				submission.data?.inserts &&
				Object.entries(submission.data?.inserts).reduce(
					(acc, [entityName, entityData]) => {
						acc[entityName] = { ..._.omit(entityData, 'records'), recordsCount: entityData.records.length };
						return acc;
					},
					{} as Record<string, DataInsertsActiveSubmissionSummary>,
				);

			const dataUpdatesSummary =
				submission.data.updates &&
				Object.entries(submission.data?.updates).reduce(
					(acc, [entityName, entityData]) => {
						acc[entityName] = { recordsCount: entityData.length };
						return acc;
					},
					{} as Record<string, DataUpdatesActiveSubmissionSummary>,
				);

			const dataDeletesSummary =
				submission.data.deletes &&
				Object.entries(submission.data?.deletes).reduce(
					(acc, [entityName, entityData]) => {
						acc[entityName] = { recordsCount: entityData.length };
						return acc;
					},
					{} as Record<string, DataDeletesActiveSubmissionSummary>,
				);

			return {
				id: submission.id,
				data: { inserts: dataInsertsSummary, updates: dataUpdatesSummary, deletes: dataDeletesSummary },
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

		removeEntityFromSubmission: (submissionData: Record<string, SubmissionInsertData>, entityName: string) => {
			return _.omit(submissionData, entityName);
		},

		/**
		 * Construct a SubmissionInsertData object per each file returning a Record type based on entityName
		 * @param {Record<string, Express.Multer.File>} files
		 * @param {string} userName
		 * @returns {Promise<Record<string, SubmissionInsertData>>}
		 */
		submissionEntitiesFromFiles: async (
			files: Record<string, Express.Multer.File>,
			userName: string,
		): Promise<Record<string, SubmissionInsertData>> => {
			const filesDataProcessed: Record<string, SubmissionInsertData> = {};
			await Promise.all(
				Object.entries(files).map(async ([entityName, file]) => {
					const parsedFileData = await tsvToJson(file.path);
					filesDataProcessed[entityName] = {
						batchName: file.originalname,
						creator: userName,
						records: parsedFileData,
					} as SubmissionInsertData;
				}),
			);
			return filesDataProcessed;
		},

		/**
		 * Update Active Submission in database
		 * @param {Object} input
		 * @param {number} input.dictionaryId The Dictionary ID of the Submission
		 * @param {SubmissionData} input.submissionData Data to be submitted grouped on inserts, updates and deletes
		 * @param {number} input.idActiveSubmission ID of the Active Submission
		 * @param {Record<string, SchemaValidationError[]>} input.schemaErrors Array of schemaErrors
		 * @param {string} input.userName User updating the active submission
		 * @returns {Promise<Submission>} An Active Submission updated
		 */
		updateActiveSubmission: async (input: {
			dictionaryId: number;
			submissionData: SubmissionData;
			idActiveSubmission: number;
			schemaErrors: Record<string, SchemaValidationError[]>;
			userName: string;
		}): Promise<Submission> => {
			const { dictionaryId, submissionData, idActiveSubmission, schemaErrors, userName } = input;
			const newStatusSubmission =
				Object.keys(schemaErrors).length > 0 ? SUBMISSION_STATUS.INVALID : SUBMISSION_STATUS.VALID;
			// Update with new data
			const updatedActiveSubmission = await submissionRepo.update(idActiveSubmission, {
				data: submissionData,
				status: newStatusSubmission,
				dictionaryId: dictionaryId,
				updatedBy: userName,
				errors: schemaErrors,
			});

			logger.info(
				LOG_MODULE,
				`Updated Active submission '${updatedActiveSubmission.id}' with status '${newStatusSubmission}' on category '${updatedActiveSubmission.dictionaryCategoryId}'`,
			);
			return updatedActiveSubmission;
		},
	};
};

export default utils;
