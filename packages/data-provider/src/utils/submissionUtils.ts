import * as _ from 'lodash-es';

import {
	type Submission,
	SubmissionData,
	type SubmissionDeleteData,
	type SubmissionInsertData,
	type SubmissionUpdateData,
	type SubmittedData,
} from '@overture-stack/lyric-data-model';
import {
	type BatchProcessingResult,
	SchemaData,
	SchemasDictionary,
	type SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { processSchemas } from '@overturebio-stack/lectern-client/lib/schema-functions.js';

import { getSchemaFieldNames } from './dictionaryUtils.js';
import { readHeaders, tsvToJson } from './fileUtils.js';
import { groupErrorsByIndex, mapAndMergeSubmittedDataToRecordReferences } from './submittedDataUtils.js';
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
	type EditSubmittedDataReference,
	MERGE_REFERENCE_TYPE,
	type NewSubmittedDataReference,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	SubmissionStatus,
	SubmittedDataReference,
} from './types.js';

// export default utils;
// Only "open", "valid", and "invalid" statuses are considered Active Submission
const statusesAllowedToClose = [SUBMISSION_STATUS.OPEN, SUBMISSION_STATUS.VALID, SUBMISSION_STATUS.INVALID] as const;
type StatusesAllowedToClose = typeof statusesAllowedToClose extends Array<infer T> ? T : never;

/** Determines if a Submission can be closed based on it's current status
 * @param {SubmissionStatus} status Status of a Submission
 * @returns {boolean}
 */
export const canTransitionToClosed = (status: SubmissionStatus): status is StatusesAllowedToClose => {
	const openStatuses: SubmissionStatus[] = [...statusesAllowedToClose];
	return openStatuses.includes(status);
};

/**
 * Checks if file contains required fields based on schema
 * @param {SchemasDictionary} dictionary A dictionary to validate with
 * @param {Record<string, Express.Multer.File>} entityFileMap A Record to map a file with a entityName as a key
 * @returns a list of valid files and a list of errors
 */
export const checkEntityFieldNames = async (
	dictionary: SchemasDictionary,
	entityFileMap: Record<string, Express.Multer.File>,
) => {
	const checkedEntities: Record<string, Express.Multer.File> = {};
	const fieldNameErrors: BatchError[] = [];

	for (const [entityName, file] of Object.entries(entityFileMap)) {
		const fileHeaders = await readHeaders(file);

		const schemaFieldNames = await getSchemaFieldNames(dictionary, entityName);

		const missingRequiredFields = schemaFieldNames.required.filter(
			(requiredField) => !fileHeaders.includes(requiredField),
		);
		if (missingRequiredFields.length > 0) {
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
};

/**
 * Removes invalid/duplicated files
 * @param {Express.Multer.File[]} files An array of files
 * @param {string[]} dictionarySchemaNames Schema names in the dictionary
 * @returns A list of valid files mapped by schema/entity names
 */
export const checkFileNames = async (
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
			batchErrors.push({
				type: BATCH_ERROR_TYPE.MULTIPLE_TYPED_FILES,
				message: 'Multiple schemas matches this file',
				batchName: file.originalname,
			});
		} else if (matchingName.length === 1) {
			validFileEntity[matchingName[0]] = file;
		} else {
			batchErrors.push({
				type: BATCH_ERROR_TYPE.INVALID_FILE_NAME,
				message: 'Filename does not relate any schema name',
				batchName: file.originalname,
			});
		}
	}

	return {
		validFileEntity,
		batchErrors,
	};
};

/**
 * Checks if object is a Submission or a SubmittedData
 * @param {SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference} toBeDetermined
 * @returns {boolean}
 */
export const determineIfIsSubmission = (
	toBeDetermined: SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference,
): toBeDetermined is NewSubmittedDataReference | EditSubmittedDataReference => {
	const type = (toBeDetermined as NewSubmittedDataReference | EditSubmittedDataReference).type;
	return type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA || type === MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA;
};

/**
 * Creates a Record type of SchemaData grouped by Entity names
 * @param {Record<string, DataRecordReference[]>} mergeDataRecordsByEntityName
 * @returns {Record<string, SchemaData>}
 */
export const extractSchemaDataFromMergedDataRecords = (
	mergeDataRecordsByEntityName: Record<string, DataRecordReference[]>,
): Record<string, SchemaData> => {
	return _.mapValues(mergeDataRecordsByEntityName, (mappingArray) => mappingArray.map((o) => o.dataRecord));
};

/**
 * Returns only the schema errors corresponding to the Active Submission.
 * Schema errors are grouped by Entity name.
 * @param {object} input
 * @param {Record<string, BatchProcessingResult>} input.resultValidation
 * @param {Record<string, DataRecordReference[]>} input.dataValidated
 * @returns {Record<string, Record<string, SchemaValidationError[]>>}
 */
export const groupSchemaErrorsByEntity = (input: {
	resultValidation: Record<string, BatchProcessingResult>;
	dataValidated: Record<string, DataRecordReference[]>;
}): Record<string, Record<string, SchemaValidationError[]>> => {
	const { resultValidation, dataValidated } = input;

	const submissionSchemaErrors: Record<string, Record<string, SchemaValidationError[]>> = {};
	Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
		const hasErrorByIndex = groupErrorsByIndex(validationErrors);

		if (!_.isEmpty(hasErrorByIndex)) {
			Object.entries(hasErrorByIndex).map(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
				const mapping = dataValidated[entityName][Number(indexBasedOnCrossSchemas)];
				if (determineIfIsSubmission(mapping.reference)) {
					const submissionIndex = mapping.reference.index;
					const actionType = mapping.reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ? 'inserts' : 'updates';

					const mutableSchemaValidationErrors: SchemaValidationError[] = schemaValidationErrors.map((errors) => {
						return {
							...errors,
							index: submissionIndex,
						};
					});

					if (!submissionSchemaErrors[actionType]) {
						submissionSchemaErrors[actionType] = {};
					}

					if (!submissionSchemaErrors[actionType][entityName]) {
						submissionSchemaErrors[actionType][entityName] = [];
					}

					submissionSchemaErrors[actionType][entityName].push(...mutableSchemaValidationErrors);
				}
			});
		}
	});
	return submissionSchemaErrors;
};

/**
 * This function extracts the Schema Data from the Active Submission
 * and maps it to it's original reference Id
 * The result mapping is used to perform the cross schema validation
 * @param {number | undefined} activeSubmissionId
 * @param {Record<string, SubmissionInsertData>} activeSubmissionInsertDataEntities
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mapInsertDataToRecordReferences = (
	activeSubmissionId: number | undefined,
	activeSubmissionInsertDataEntities: Record<string, SubmissionInsertData>,
): Record<string, DataRecordReference[]> => {
	return _.mapValues(activeSubmissionInsertDataEntities, (submissionInsertData) =>
		submissionInsertData.records.map((record, index) => {
			return {
				dataRecord: record,
				reference: {
					submissionId: activeSubmissionId,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					index: index,
				} as NewSubmittedDataReference,
			};
		}),
	);
};

/**
 * Combines **Active Submission** and the **Submitted Data** recevied as arguments.
 * Then, the Schema Data is extracted and mapped with its internal reference ID.
 * The returned Object is a collection of the raw Schema Data with it's reference ID grouped by entity name.
 * @param {Submission} originalSubmission The Active Submission to be merged
 * @param {Object} submissionData
 * @param {Record<string, SubmissionInsertData>} submissionData.insertData Collection of Data records of the Active Submission
 * @param {Record<string, SubmissionUpdateData[]>} submissionData.updateData Collection of Data records of the Active Submission
 * @param {Record<string, SubmissionDeleteData[]>} submissionData.deleteData Collection of Data records of the Active Submission
 * @param {number} submissionData.id ID of the Active Submission
 * @param {SubmittedData[]} submittedData An array of Submitted Data
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mergeAndReferenceEntityData = ({
	originalSubmission,
	submissionData,
	submittedData,
}: {
	originalSubmission: Submission;
	submissionData: SubmissionData;
	submittedData: SubmittedData[];
}): Record<string, DataRecordReference[]> => {
	const systemsIdsToRemove = submissionData.deletes
		? Object.values(submissionData.deletes).flatMap((entityData) => entityData.map(({ systemId }) => systemId))
		: [];

	// Exclude items that are marked for deletion
	const submittedDataFiltered =
		systemsIdsToRemove.length > 0
			? submittedData.filter(({ systemId }) => !systemsIdsToRemove.includes(systemId))
			: submittedData;

	const submittedDataWithRef = mapAndMergeSubmittedDataToRecordReferences({
		submittedData: submittedDataFiltered,
		editSubmittedData: submissionData.updates,
		submissionId: originalSubmission.id,
	});

	const insertDataWithRef = submissionData.inserts
		? mapInsertDataToRecordReferences(originalSubmission.id, submissionData.inserts)
		: {};

	// This object will merge existing data + new data for validation (Submitted data + active Submission)
	return _.mergeWith(submittedDataWithRef, insertDataWithRef, (objValue, srcValue) => {
		if (Array.isArray(objValue)) {
			// If both values are arrays, concatenate them
			return objValue.concat(srcValue);
		}
	});
};

/**
 * Merge two `Record<string, T[]>` objects into a single `Record<string, T[]>` object.
 * For each key in the records, the corresponding arrays from both records are concatenated.
 * @param record1 The first `Record<string, T[]>` object. If `undefined`, it is treated as an empty record.
 * @param record2 The second `Record<string, T[]>` object. If `undefined`, it is treated as an empty record.
 * @returns
 */
export const mergeRecords = <T>(
	record1: Record<string, T[]> | undefined,
	record2: Record<string, T[]> | undefined,
): Record<string, T[]> => {
	return Object.keys({ ...record1, ...record2 }).reduce<Record<string, T[]>>((acc, key) => {
		acc[key] = (record1?.[key] || []).concat(record2?.[key] || []);
		return acc;
	}, {});
};

/**
 * Utility to parse a raw Active Submission to a Response type
 * @param {ActiveSubmissionSummaryRepository} submission
 * @returns {ActiveSubmissionResponse}
 */
export const parseActiveSubmissionResponse = (
	submission: ActiveSubmissionSummaryRepository,
): ActiveSubmissionResponse => {
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
};

/**
 * Utility to parse a raw Active Submission to a Summary of the Active Submission
 * @param {ActiveSubmissionSummaryRepository} submission
 * @returns {ActiveSubmissionSummaryResponse}
 */
export const parseActiveSubmissionSummaryResponse = (
	submission: ActiveSubmissionSummaryRepository,
): ActiveSubmissionSummaryResponse => {
	const dataInsertsSummary =
		submission.data?.inserts &&
		Object.entries(submission.data?.inserts).reduce<Record<string, DataInsertsActiveSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { ..._.omit(entityData, 'records'), recordsCount: entityData.records.length };
				return acc;
			},
			{},
		);

	const dataUpdatesSummary =
		submission.data.updates &&
		Object.entries(submission.data?.updates).reduce<Record<string, DataUpdatesActiveSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { recordsCount: entityData.length };
				return acc;
			},
			{},
		);

	const dataDeletesSummary =
		submission.data.deletes &&
		Object.entries(submission.data?.deletes).reduce<Record<string, DataDeletesActiveSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { recordsCount: entityData.length };
				return acc;
			},
			{},
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
};

export const removeItemsFromSubmission = (
	submissionData: SubmissionData,
	filter: { actionType: SubmissionActionType; entityName: string; index: number | null },
): SubmissionData => {
	const filteredSubmissionData = _.cloneDeep(submissionData);
	switch (filter.actionType) {
		case SUBMISSION_ACTION_TYPE.Values.INSERTS:
			if (submissionData.inserts) {
				const filteredInserts = Object.entries(submissionData.inserts).reduce<Record<string, SubmissionInsertData>>(
					(acc, [insertsEntityName, insertsSubmissionData]) => {
						if (insertsEntityName === filter.entityName && filter.index == null) {
							// remove this whole entity
							return acc;
						} else if (insertsEntityName === filter.entityName && filter.index != null) {
							// remove an item on records based on it's index
							const filteredRecords = insertsSubmissionData.records.filter(
								(_, recordIndex) => recordIndex !== filter.index,
							);
							if (filteredRecords.length > 0) {
								acc[insertsEntityName] = {
									batchName: insertsSubmissionData.batchName,
									records: filteredRecords,
								};
							}
						} else {
							acc[insertsEntityName] = insertsSubmissionData;
						}

						return acc;
					},
					{},
				);
				if (Object.keys(filteredInserts).length === 0) {
					delete filteredSubmissionData.inserts;
				} else {
					filteredSubmissionData.inserts = filteredInserts;
				}
			}
			break;
		case SUBMISSION_ACTION_TYPE.Values.UPDATES:
			if (submissionData.updates) {
				const filteredUpdates = Object.entries(submissionData.updates).reduce<Record<string, SubmissionUpdateData[]>>(
					(acc, [updatesEntityName, updatesSubmissionData]) => {
						if (updatesEntityName === filter.entityName && filter.index == null) {
							// remove this whole entity
							return acc;
						} else if (updatesEntityName === filter.entityName && filter.index != null) {
							// remove an item on records based on it's index
							const filteredRecords = updatesSubmissionData.filter((_, recordIndex) => recordIndex !== filter.index);
							if (filteredRecords.length > 0) {
								acc[updatesEntityName] = filteredRecords;
							}
						} else {
							acc[updatesEntityName] = updatesSubmissionData;
						}

						return acc;
					},
					{},
				);
				if (Object.keys(filteredUpdates).length === 0) {
					delete filteredSubmissionData.updates;
				} else {
					filteredSubmissionData.updates = filteredUpdates;
				}
			}
			break;
		case SUBMISSION_ACTION_TYPE.Values.DELETES:
			if (submissionData.deletes) {
				const filteredDeletes = Object.entries(submissionData.deletes).reduce<Record<string, SubmissionDeleteData[]>>(
					(acc, [deletesEntityName, deletesSubmissionData]) => {
						if (deletesEntityName === filter.entityName && filter.index == null) {
							// remove this whole entity
							return acc;
						} else if (deletesEntityName === filter.entityName && filter.index != null) {
							// remove an item on records based on it's index
							const filteredRecords = deletesSubmissionData.filter((_, recordIndex) => recordIndex !== filter.index);
							if (filteredRecords.length > 0) {
								acc[deletesEntityName] = filteredRecords;
							}
						} else {
							acc[deletesEntityName] = deletesSubmissionData;
						}
						return acc;
					},
					{},
				);
				if (Object.keys(filteredDeletes).length === 0) {
					delete filteredSubmissionData.deletes;
				} else {
					filteredSubmissionData.deletes = filteredDeletes;
				}
			}
			break;
	}
	return filteredSubmissionData;
};

/**
 * Construct a SubmissionInsertData object per each file returning a Record type based on entityName
 * @param {Record<string, Express.Multer.File>} files
 * @returns {Promise<Record<string, SubmissionInsertData>>}
 */
export const submissionInsertDataFromFiles = async (
	files: Record<string, Express.Multer.File>,
): Promise<Record<string, SubmissionInsertData>> => {
	return await Object.entries(files).reduce<Promise<Record<string, SubmissionInsertData>>>(
		async (accPromise, [entityName, file]) => {
			const acc = await accPromise;
			const parsedFileData = await tsvToJson(file.path);
			acc[entityName] = {
				batchName: file.originalname,
				records: parsedFileData,
			};
			return Promise.resolve(acc);
		},
		Promise.resolve({}),
	);
};

/**
 * Validate a full set of Schema Data using a Dictionary
 * @param {SchemasDictionary & {id: number }} dictionary
 * @param {Record<string, SchemaData>} schemasData
 * @returns an array of processedRecords and validationErrors for each Schema
 */
export const validateSchemas = (
	dictionary: SchemasDictionary & {
		id: number;
	},
	schemasData: Record<string, SchemaData>,
) => {
	const schemasDictionary: SchemasDictionary = {
		name: dictionary.name,
		version: dictionary.version,
		schemas: dictionary.schemas,
	};

	return processSchemas(schemasDictionary, schemasData);
};
