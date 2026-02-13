import * as _ from 'lodash-es';
import plur from 'plur';

import {
	type DataRecord,
	Dictionary as SchemasDictionary,
	DictionaryValidationError,
	parse,
	Schema,
	TestResult,
	validate,
} from '@overture-stack/lectern-client';
import {
	SubmissionData,
	type SubmissionDeleteData,
	type SubmissionErrors,
	type SubmissionInsertData,
	type SubmissionUpdateData,
	type SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import { isSubmissionActionTypeValid } from './auditUtils.js';
import type { SchemaChildNode } from './dictionarySchemaRelations.js';
import { asArray, deepCompare } from './formatUtils.js';
import { groupErrorsByIndex, mapAndMergeSubmittedDataToRecordReferences } from './submittedDataUtils.js';
import {
	type DataRecordReference,
	type EditSubmittedDataReference,
	MERGE_REFERENCE_TYPE,
	type NewSubmittedDataReference,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	type SubmissionDataDetailsRepositoryRecord,
	type SubmissionDataSummary,
	type SubmissionDataSummaryRepositoryRecord,
	type SubmissionDetailsResponse,
	type SubmissionErrorsSummary,
	type SubmissionStatus,
	type SubmissionSummary,
	SubmittedDataReference,
} from './types.js';

// Only "open", "valid", and "invalid" statuses are considered Active Submission
export const openSubmissionStatus = [
	SUBMISSION_STATUS.OPEN,
	SUBMISSION_STATUS.VALID,
	SUBMISSION_STATUS.INVALID,
] as const;
export type OpenSubmissionStatus = typeof openSubmissionStatus;

/** Determines if a Submission status is considered active based on its status
 * @param {SubmissionStatus} status Status of a Submission
 * @returns {boolean}
 */
export const isSubmissionActive = (status: SubmissionStatus): status is OpenSubmissionStatus[number] => {
	const openStatuses: SubmissionStatus[] = [...openSubmissionStatus];
	return openStatuses.includes(status);
};

/**
 * Checks if object is a Submission or a SubmittedData
 * @param {SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference} toBeDetermined
 * @returns {boolean}
 */
export const determineIfIsSubmission = (
	reference: SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference,
) =>
	reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ||
	reference.type === MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA;

/**
 * Creates a Record type of DataRecord[] grouped by Entity names
 * @param {Record<string, DataRecordReference[]>} mergeDataRecordsByEntityName
 * @returns {Record<string, DataRecord[]>}
 */
export const extractSchemaDataFromMergedDataRecords = (
	mergeDataRecordsByEntityName: Record<string, DataRecordReference[]>,
): Record<string, DataRecord[]> => {
	return _.mapValues(mergeDataRecordsByEntityName, (mappingArray) => mappingArray.map((o) => o.dataRecord));
};

/**
 * Checks whether a record exists within a collection of submitted data records marked for update.
 * The lookup is performed by matching the given 'entityName' and 'systemId'.
 *
 * @Returns true if found, false otherwise
 */
export const findEditSubmittedData = (
	entityName: string,
	systemId: string,
	dataByEntityName: Record<string, DataRecordReference[]>,
) => {
	return (
		dataByEntityName[entityName]?.some(
			(data) =>
				data.reference.type === MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA && data.reference.systemId === systemId,
		) ?? false
	);
};
/**
 * Finds and returns a list of invalid records based on a provided schema name.
 *
 * This function checks if the validation results are marked as invalid, and if so,
 * filters the validation errors to return those related to a specific schema name.
 *
 * @param results - The validation results containing details of validation errors.
 * @param entityName - The name of the schema to filter the invalid records by.
 *
 * @returns An array of invalid records for the specified schema, or an empty array if none are found.
 */
export const findInvalidRecordErrorsBySchemaName = (
	results: TestResult<DictionaryValidationError[]>,
	entityName: string,
) => {
	return results.valid === false
		? results.details
				.filter((err) => err.reason === 'INVALID_RECORDS')
				.filter((r) => r.schemaName == entityName)
				.flatMap((e) => e.invalidRecords)
		: [];
};

/**
 * Generalized function to filter out conflicting records between two data sets based on `systemId`.
 *
 * This function can be used to either filter updates from deletes or deletes from updates, depending on the provided parameters.
 * It removes records from the `sourceData` that have a matching `systemId` in the `conflictData`.
 *
 * @param sourceData - A record of the primary data (e.g., updates or deletes) to be filtered, grouped by entity name.
 * @param conflictData - A record of data that might conflict (e.g., deletes or updates), grouped by entity name.
 * @param entitySelector - A function to select the `systemId` from the source records.
 * @param conflictSelector - A function to select the `systemId` from the conflict records.
 * @returns A record of filtered source data, excluding records that conflict based on `systemId`.
 */
export const filterRecordsByConflicts = <SourceData, ConflictData>(
	sourceData: Record<string, SourceData[]>,
	conflictData: Record<string, ConflictData[]>,
	entitySelector: (item: SourceData) => string,
	conflictSelector: (item: ConflictData) => string,
): Record<string, SourceData[]> => {
	return Object.entries(sourceData).reduce<Record<string, SourceData[]>>((acc, [entityName, sourceItems]) => {
		const conflicts = conflictData[entityName];

		if (conflicts) {
			// Create a Set of systemIds from conflict records for faster lookup
			const conflictIdsSet = new Set(conflicts.map(conflictSelector));

			// Filter source data that does not have a matching systemId in the conflict set
			const filteredValues = sourceItems.filter((item) => !conflictIdsSet.has(entitySelector(item)));

			if (filteredValues.length > 0) {
				acc[entityName] = filteredValues;
			}
		} else {
			// If no conflicts, keep the source data as is
			acc[entityName] = sourceItems;
		}

		return acc;
	}, {});
};

/**
 * Filters updates from the provided `submissionUpdateData` based on conflicts found in the `submissionDeleteData`.
 * Conflicts are determined by matching the `systemId` of the items in both records.
 *
 * @param submissionUpdateData - A record containing arrays of `SubmissionUpdateData` to be filtered.
 * @param submissionDeleteData - A record containing arrays of `SubmissionDeleteData` that defines the conflicts.
 * @returns A filtered record of `SubmissionUpdateData[]` where no items conflict with those in `submissionDeleteData`.
 */
export const filterUpdatesFromDeletes = (
	submissionUpdateData: Record<string, SubmissionUpdateData[]>,
	submissionDeleteData: Record<string, SubmissionDeleteData[]>,
): Record<string, SubmissionUpdateData[]> => {
	return filterRecordsByConflicts(
		submissionUpdateData,
		submissionDeleteData,
		(itemToUpdate) => itemToUpdate.systemId,
		(itemToDelete) => itemToDelete.systemId,
	);
};

/**
 * Filters deletes from the provided `submissionDeleteData` based on conflicts found in the `submissionUpdateData`.
 * Conflicts are determined by matching the `systemId` of the items in both records.
 *
 * @param submissionDeleteData - A record containing arrays of `SubmissionDeleteData` to be filtered.
 * @param submissionUpdateData - A record containing arrays of `SubmissionUpdateData` that defines the conflicts.
 * @returns A filtered record of `SubmissionDeleteData[]` where no items conflict with those in `submissionUpdateData`.
 */
export const filterDeletesFromUpdates = (
	submissionDeleteData: Record<string, SubmissionDeleteData[]>,
	submissionUpdateData: Record<string, SubmissionUpdateData[]>,
): Record<string, SubmissionDeleteData[]> => {
	return filterRecordsByConflicts(
		submissionDeleteData,
		submissionUpdateData,
		(itemToDelete) => itemToDelete.systemId,
		(itemToUpdate) => itemToUpdate.systemId,
	);
};

/**
 * Returns a filter to query the database used to find dependents records when the update record involves changes of an primary ID field
 *
 * @param schemaRelations An array of `SchemaChildNode` representing the schema relations for the entity. Each node contains information about parent-child relationships.
 * @param updateRecord The update record containing old and new data. The function checks the `old` data to identify fields involved in the relationship.
 * @returns
 */
export const filterRelationsForPrimaryIdUpdate = (
	schemaRelations: SchemaChildNode[],
	updateRecord: SubmissionUpdateData,
): {
	entityName: string;
	dataField: string;
	dataValue: string | undefined;
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
					dataValue: updateRecord.old[childNode.fieldName]?.toString(),
				};
			})
	);
};

/**
 * Returns only the schema errors corresponding to the Active Submission.
 * Schema errors are grouped by Entity name.
 * @param {object} input
 * @param {TestResult<DictionaryValidationError[]>} input.resultValidation
 * @param {Record<string, DataRecordReference[]>} input.dataValidated
 * @returns {SubmissionErrors}
 */
export const groupSchemaErrorsByEntity = (input: {
	resultValidation: TestResult<DictionaryValidationError[]>;
	dataValidated: Record<string, DataRecordReference[]>;
}): SubmissionErrors => {
	const { resultValidation, dataValidated } = input;

	if (resultValidation.valid) {
		return {};
	}

	const submissionSchemaErrors: SubmissionErrors = {};
	resultValidation.details.forEach((dictionaryValidationError) => {
		const entityName = dictionaryValidationError.schemaName;
		if (dictionaryValidationError.reason !== 'INVALID_RECORDS') {
			return;
		}

		const groupedErrorsByIndex = groupErrorsByIndex(dictionaryValidationError.invalidRecords);

		if (!groupedErrorsByIndex || Object.keys(groupedErrorsByIndex).length === 0) {
			return;
		}

		Object.entries(groupedErrorsByIndex).forEach(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
			const mapping = dataValidated[entityName][Number(indexBasedOnCrossSchemas)];
			if (!determineIfIsSubmission(mapping.reference)) {
				return;
			}

			const submissionIndex = mapping.reference.index;
			const actionType = mapping.reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ? 'inserts' : 'updates';

			const mutableSchemaValidationErrors = schemaValidationErrors.map((errors) => ({
				...errors,
				index: submissionIndex,
			}));

			if (!submissionSchemaErrors[actionType]) {
				submissionSchemaErrors[actionType] = {};
			}

			if (!submissionSchemaErrors[actionType][entityName]) {
				submissionSchemaErrors[actionType][entityName] = [];
			}

			submissionSchemaErrors[actionType][entityName].push(...mutableSchemaValidationErrors);
		});
	});
	return submissionSchemaErrors;
};

/**
 * This function extracts the Schema Data from the Active Submission
 * and maps it to it's original reference Id
 * The result mapping is used to perform the cross schema validation
 * @param {number} activeSubmissionId
 * @param {Record<string, SubmissionInsertData>} activeSubmissionInsertDataEntities
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mapInsertDataToRecordReferences = (
	activeSubmissionId: number,
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
				},
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
		dataValue: string | undefined;
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
 * @param {number} submissionId ID of the Active Submission
 * @param {Object} submissionData
 * @param {Record<string, SubmissionInsertData>} submissionData.insertData Collection of Data records of the Active Submission
 * @param {Record<string, SubmissionUpdateData[]>} submissionData.updateData Collection of Data records of the Active Submission
 * @param {Record<string, SubmissionDeleteData[]>} submissionData.deleteData Collection of Data records of the Active Submission
 * @param {SubmittedData[]} submittedData An array of Submitted Data
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mergeAndReferenceEntityData = ({
	submissionId,
	submissionData,
	submittedData,
}: {
	submissionId: number;
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
		submissionId,
	});

	const insertDataWithRef = submissionData.inserts
		? mapInsertDataToRecordReferences(submissionId, submissionData.inserts)
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

	let seen: DataRecord[] = [];
	// Iterate over all objects
	objects.forEach((obj) => {
		// Iterate over each key in the current object
		Object.entries(obj).forEach(([key, value]) => {
			if (result[key]) {
				// The key already exists in the result, concatenate the `records` arrays, avoiding duplicates
				let uniqueData: DataRecord[] = [];

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
 * Utility to convert a raw Submission record to a Response type
 * @param {SubmissionDataDetailsRepositoryRecord} submission
 * @returns {SubmissionDetailsResponse}
 */
export const createSubmissionDetailsResponse = (
	submission: SubmissionDataDetailsRepositoryRecord,
): SubmissionDetailsResponse => {
	return {
		id: submission.id,
		data: submission.data,
		dictionary: submission.dictionary,
		dictionaryCategory: submission.dictionaryCategory,
		errors: submission.errors || {},
		organization: submission.organization,
		status: submission.status,
		createdAt: _.toString(submission.createdAt?.toISOString()),
		createdBy: _.toString(submission.createdBy),
		updatedAt: _.toString(submission.updatedAt?.toISOString()),
		updatedBy: _.toString(submission.updatedBy),
	};
};

/**
 * Utility to sum the recordsCount from a SubmissionDataSummary or SubmissionErrorsSummary
 */
const sumRecordsCount = (buckets: SubmissionDataSummary | SubmissionErrorsSummary): number => {
	return Object.values(buckets)
		.flatMap((bucket) => (bucket ? Object.values(bucket) : []))
		.reduce((total, { recordsCount }) => total + recordsCount, 0);
};

/**
 * Utility to convert the raw SubmissionDataSummaryRepositoryRecord into a SubmissionSummaryResponse.
 * It includes a `total` value representing the sum of changes of each `data` and `errors`
 * @param {SubmissionDataSummaryRepositoryRecord} submission
 * @returns {SubmissionSummary}
 */
export const createSubmissionSummaryResponse = (
	submission: SubmissionDataSummaryRepositoryRecord,
): SubmissionSummary => {
	return {
		id: submission.id,
		data: {
			...submission.data,
			total: sumRecordsCount(submission.data),
		},
		dictionary: submission.dictionary,
		dictionaryCategory: submission.dictionaryCategory,
		errors: {
			...submission.errors,
			total: sumRecordsCount(submission.errors),
		},
		organization: submission.organization,
		status: submission.status,
		createdAt: _.toString(submission.createdAt?.toISOString()),
		createdBy: _.toString(submission.createdBy),
		updatedAt: _.toString(submission.updatedAt?.toISOString()),
		updatedBy: _.toString(submission.updatedBy),
	};
};

export const pluralizeSchemaName = (schemaName: string) => {
	return plur(schemaName);
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
					const foundIdFieldUpdated = filterRelationsForPrimaryIdUpdate(schemaRelations, submissionUpdateData);
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
 * Validate a full set of Schema Data using a Dictionary
 * @param {SchemasDictionary & {id: number }} dictionary
 * @param {Record<string, DataRecord[]>} schemasData
 * @returns  A TestResult object representing the outcome of a test applied to some data.
 * If a test is valid, no additional data is added to the result. If it is invalid, then the
 * reason (or array of reasons) for why the test failed should be given.
 */
export const validateSchemas = (
	dictionary: SchemasDictionary & {
		id: number;
	},
	schemasData: Record<string, DataRecord[]>,
) => {
	const schemasDictionary: SchemasDictionary = {
		name: dictionary.name,
		version: dictionary.version,
		schemas: dictionary.schemas,
	};

	return validate.validateDictionary(schemasData, schemasDictionary);
};

export const parseToSchema = (schema: Schema) => (record: Record<string, string>) => {
	const parsedRecord = parse.parseRecordValues(record, schema);
	return parsedRecord.data.record;
};

export const parseSubmissionActionTypes = (values: unknown): SubmissionActionType[] => {
	return asArray(values || [])
		.map((value) => value.toString().toUpperCase())
		.filter(isSubmissionActionTypeValid)
		.map((value) => SUBMISSION_ACTION_TYPE.parse(value));
};
