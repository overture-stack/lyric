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
	type DataRecord,
	SchemaData,
	SchemasDictionary,
	type SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { processSchemas } from '@overturebio-stack/lectern-client/lib/schema-functions.js';

import type { SchemaChildNode } from './dictionarySchemaRelations.js';
import { getSchemaFieldNames } from './dictionaryUtils.js';
import { readHeaders, tsvToJson } from './fileUtils.js';
import { deepCompare } from './formatUtils.js';
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
 * Returns a filter to query the database used to find dependents records when the update record involves changes of an primary ID field
 *
 * @param schemaRelations An array of `SchemaChildNode` representing the schema relations for the entity. Each node contains information about parent-child relationships.
 * @param updateRecord The update record containing old and new data. The function checks the `old` data to identify fields involved in the relationship.
 * @returns
 */
export const getDependentsFilteronSubmissionUpdate = (
	schemaRelations: SchemaChildNode[],
	updateRecord: SubmissionUpdateData,
): {
	entityName: string;
	dataField: string;
	dataValue: string;
}[] => {
	return (
		schemaRelations
			.filter((childNode) => childNode.parent?.fieldName)
			// To identify if the update involves an ID field
			.filter((childNode) => updateRecord.old && updateRecord.old[childNode.fieldName])
			.map((childNode) => {
				return {
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: updateRecord.old[childNode.fieldName].toString(),
				};
			})
	);
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
 * This function takes a collection of dependent data grouped by entity name, applies a filter to each entity,
 * and creates a mapping of `SubmissionUpdateData` based on the specified filter and new data values.
 *
 * @param params
 * @param param.dependentData A record where each key is an entity name and each value is an array of `SubmittedData` objects.
 * @param param.filterEntity An array of filter criteria where each entry contains an `entityName`, `dataField`, and `dataValue` to filter.
 * @param param.newDataRecord A record containing new data values to be applied to the filtered entities.
 * @returns
 */
export const mapGroupedUpdateSubmissionData = ({
	dependentData,
	filterEntity,
	newDataRecord,
}: {
	dependentData: Record<string, SubmittedData[]>;
	filterEntity: {
		entityName: string;
		dataField: string;
		dataValue: string;
	}[];
	newDataRecord: DataRecord;
}): Record<string, SubmissionUpdateData[]> => {
	return Object.entries(dependentData).reduce<Record<string, SubmissionUpdateData[]>>(
		(acc, [entityName, dependentRecords]) => {
			acc[entityName] = dependentRecords.map((item) => {
				const filter = filterEntity.find((filter) => filter.entityName === item.entityName);
				const oldValue = filter ? { [filter.dataField]: filter.dataValue } : {};
				const newValue = filter ? { [filter.dataField]: newDataRecord[filter.dataField] } : {};
				return { systemId: item.systemId, old: oldValue, new: newValue };
			});
			return acc;
		},
		{},
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
 * Merges multiple `Record<string, SubmissionInsertData>` objects into a single object.
 * If there are duplicate keys between the objects, the `records` arrays of `SubmissionInsertData`
 * are concatenated for the matching keys, ensuring no duplicates.
 *
 * @param objects An array of objects where each object is a `Record<string, SubmissionInsertData>`.
 * Each key represents the entityName, and the value is an object of type `SubmissionInsertData`.
 *
 * @returns A new `Record<string, SubmissionInsertData>` where:
 * - If a key is unique across all objects, its value is directly included.
 * - If a key appears in multiple objects, the `records` arrays are concatenated for that key, avoiding duplicates.
 */
export const mergeInsertsRecords = (
	...objects: Record<string, SubmissionInsertData>[]
): Record<string, SubmissionInsertData> => {
	const result: Record<string, SubmissionInsertData> = {};

	let seen: SchemaData = [];
	// Iterate over all objects
	objects.forEach((obj) => {
		// Iterate over each key in the current object
		Object.entries(obj).forEach(([key, value]) => {
			if (result[key]) {
				// The key already exists in the result, concatenate the `records` arrays, avoiding duplicates
				let uniqueData: SchemaData = [];

				result[key].records.concat(value.records).forEach((item) => {
					if (!seen.some((existingItem) => deepCompare(existingItem, item))) {
						uniqueData = uniqueData.concat(item);
						seen = seen.concat(item);
					}
				});

				result[key].records = uniqueData;
				return;
			} else {
				// The key doesn't exists in the result, create as it comes
				result[key] = value;
				return;
			}
		});
	});

	return result;
};

/**
 * Merges multiple `Record<string, SubmissionDeleteData[]>` objects into a single object.
 * For each key, the `SubmissionDeleteData[]` arrays are concatenated, ensuring no duplicate
 * `SubmissionDeleteData` objects based on the `systemId` field.
 *
 * @param objects Multiple `Record<string, SubmissionDeleteData[]>` objects to be merged.
 * Each key represents an identifier, and the value is an array of `SubmissionDeleteData`.
 *
 * @returns
 */
export const mergeDeleteRecords = (
	...objects: Record<string, SubmissionDeleteData[]>[]
): Record<string, SubmissionDeleteData[]> => {
	const result: Record<string, SubmissionDeleteData[]> = {};

	// Iterate over all objects
	objects.forEach((obj) => {
		// Iterate over each key in the current object
		Object.entries(obj).forEach(([key, value]) => {
			if (!result[key]) {
				result[key] = [];
			}
			const uniqueRecords = new Map<string, SubmissionDeleteData>();

			// Add existing records to the map
			result[key].forEach((record) => uniqueRecords.set(record.systemId, record));

			// Add new records, overriding duplicates based on systemId
			value.forEach((record) => uniqueRecords.set(record.systemId, record));

			// Convert the map back to an array
			result[key] = Array.from(uniqueRecords.values());
		});
	});

	return result;
};

/**
 * Merge Active Submission data with incoming TSV file data processed
 *
 * @param objects
 * @returns An arbitrary number of arrays of Record<string, SubmissionUpdateData[]>
 */
export const mergeUpdatesBySystemId = (
	...objects: Record<string, SubmissionUpdateData[]>[]
): Record<string, SubmissionUpdateData[]> => {
	const result: Record<string, SubmissionUpdateData[]> = {};

	// Iterate over all objects
	objects.forEach((obj) => {
		// Iterate over each key in the current object
		Object.entries(obj).forEach(([key, value]) => {
			// Initialize a map to track unique systemIds for this key
			if (!result[key]) {
				result[key] = [];
			}

			const existingIds = new Map<string, SubmissionUpdateData>(result[key].map((item) => [item.systemId, item]));

			// Add or update entries based on systemId uniqueness
			value.forEach((item) => {
				existingIds.set(item.systemId, item);
			});

			// Convert the map back to an array and store it in the result
			result[key] = Array.from(existingIds.values());
		});
	});

	return result;
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
 * Processes the `foundDependentUpdates` array and segregates the updates based on
 * whether they involve ID fields (dependent fields) or non-ID fields.
 *
 * @param foundDependentUpdates - Array of updates to be processed.
 * @param filesDataProcessed - Record where the key is a string (representing an entity name) and
 * each value is an array of `SubmissionUpdateData`. These are the processed data files to match against.
 * @returns An object containing two records:
 * - `idFieldChangeRecord`: A record of updates involving ID fields.
 * - `nonIdFieldChangeRecord`: A record of updates involving non-ID fields.
 */
export const segregateFieldChangeRecords = (
	submissionUpdateRecords: Record<string, SubmissionUpdateData[]>,
	dictionaryRelations: Record<string, SchemaChildNode[]>,
): {
	idFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
	nonIdFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
} => {
	// Main reduce function
	return Object.entries(submissionUpdateRecords).reduce<{
		idFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
		nonIdFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
	}>(
		(acc, [entityName, submissionUpdateDataArray]) => {
			const schemaRelations = dictionaryRelations[entityName];
			if (schemaRelations) {
				submissionUpdateDataArray.map((submissionUpdateData) => {
					const foundIdFieldUpdated = getDependentsFilteronSubmissionUpdate(schemaRelations, submissionUpdateData);
					const recordKey =
						foundIdFieldUpdated && foundIdFieldUpdated.length > 0 ? 'idFieldChangeRecord' : 'nonIdFieldChangeRecord';

					if (!acc[recordKey][entityName]) {
						acc[recordKey][entityName] = [];
					}
					acc[recordKey][entityName].push(submissionUpdateData);
				});
			}

			return acc;
		},
		{ idFieldChangeRecord: {}, nonIdFieldChangeRecord: {} },
	);
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
