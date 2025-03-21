import { groupBy, has } from 'lodash-es';

import {
	type DataRecord,
	DictionaryValidationRecordErrorDetails,
	type SchemaRecordError,
} from '@overture-stack/lectern-client';
import {
	type DataDiff,
	NewSubmittedData,
	type SubmissionDeleteData,
	type SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import {
	DataRecordReference,
	type GroupedDataSubmission,
	MERGE_REFERENCE_TYPE,
	type MutableDataDiff,
	type MutableDataRecord,
	VIEW_TYPE,
	type ViewType,
} from './types.js';

/**
 * Compares two `DataRecord` objects and returns the differences between them.
 * @param oldRecord The original `DataRecord` object to compare.
 * @param newRecord The new `DataRecord` object to compare against the original.
 * @returns An object of type `DataDiff` containing the differences between `oldRecord` and `newRecord`.
 * 	The differing values are recorded with the `old` object containing the values
 * 	from `oldRecord` and the `new` object containing the corresponding values from `newRecord`.
 */
export const computeDataDiff = (oldRecord: DataRecord | null, newRecord: DataRecord | null): DataDiff => {
	const diff: MutableDataDiff = { old: {}, new: {} };

	if (!oldRecord && !newRecord) {
		// Both records are null, no differences to return
		return diff;
	}

	if (!oldRecord) {
		// oldRecord is null, all keys in newRecord are new
		for (const key in newRecord) {
			if (Object.prototype.hasOwnProperty.call(newRecord, key)) {
				diff.new[key] = newRecord[key];
			}
		}
		return diff;
	}

	if (!newRecord) {
		// newRecord is null, all keys in oldRecord are removed
		for (const key in oldRecord) {
			if (Object.prototype.hasOwnProperty.call(oldRecord, key)) {
				diff.old[key] = oldRecord[key];
			}
		}
		return diff;
	}

	// Both records are non-null, compare them
	for (const key in oldRecord) {
		if (Object.prototype.hasOwnProperty.call(oldRecord, key)) {
			const oldValue = oldRecord[key];
			const newValue = newRecord[key];

			if (oldValue !== newValue) {
				diff.old[key] = oldValue;
				diff.new[key] = newValue;
			}
		}
	}

	// Handle new keys in newRecord that were not in oldRecord
	for (const key in newRecord) {
		if (!Object.prototype.hasOwnProperty.call(oldRecord, key)) {
			diff.new[key] = newRecord[key];
		}
	}

	return diff;
};

/**
 * Convert a value into it's View type if it matches.
 * Otherwise it returns `undefined`
 * @param {unknown} value
 * @returns {ViewType | undefined}
 */
export const convertToViewType = (value: unknown): ViewType | undefined => {
	if (typeof value === 'string') {
		const parseResult = VIEW_TYPE.safeParse(value.trim().toLowerCase());

		if (parseResult.success) {
			return parseResult.data;
		}
	}
	return undefined;
};

/**
 * Abstract Error response
 * @param error
 * @returns
 */
export const fetchDataErrorResponse = (
	error: string,
): {
	result: [];
	metadata: { totalRecords: number; errorMessage?: string };
} => {
	return {
		result: [],
		metadata: {
			totalRecords: 0,
			errorMessage: error,
		},
	};
};

/**
 * Returns a list of entity names based on the provided filter options
 *
 * If the `view` flag is set in the `filterOptions` and a `defaultCentricEntity` exists
 * it returns an array containing the `defaultCentricEntity`.
 * Otherwise, it returns the `entityName` from `filterOptions`, if provided.
 *
 * @param filterOptions An object containing the view flag and the entity name array.
 * @param filterOptions.view A flag indicating the type of view to represent the records
 * @param filterOptions.entityName An array of entity names, used if view is not compound.
 * @param defaultCentricEntity The default centric entity name
 * @returns An array of entity names or empty array if no conditions are met.
 */
export const getEntityNamesFromFilterOptions = (
	filterOptions: { view: ViewType; entityName?: string[] },
	defaultCentricEntity?: string,
): string[] => {
	if (filterOptions.view === VIEW_TYPE.Values.compound && defaultCentricEntity) {
		return [defaultCentricEntity];
	} else if (filterOptions.entityName) {
		return filterOptions.entityName.filter((name) => name);
	}
	return []; // Return an empty array if no conditions are met
};

/**
 * Groupd Submitted Data by entityName
 * @param dataArray Array of data to group
 * @returns
 */
export const groupByEntityName = (dataArray: SubmittedData[]): Record<string, SubmittedData[]> => {
	return groupBy(dataArray, 'entityName');
};

/**
 * Get all the schema errors grouped by the index of the record
 * @param {SchemaRecordError<DictionaryValidationRecordErrorDetails>[]} schemaValidationErrors
 * @returns
 */
export const groupErrorsByIndex = (
	schemaValidationErrors: SchemaRecordError<DictionaryValidationRecordErrorDetails>[],
) => {
	return schemaValidationErrors.reduce<Record<number, DictionaryValidationRecordErrorDetails[]>>((acc, item) => {
		if (!acc[item.recordIndex]) {
			acc[item.recordIndex] = [];
		}
		acc[item.recordIndex] = acc[item.recordIndex].concat(item.recordErrors);

		return acc;
	}, {});
};

/**
 * Groups `NewSubmittedData` and `SubmittedData` objects by their `entityName` field.
 * @param data An object containing arrays of `NewSubmittedData` and `SubmittedData` objects.
 * @returns An object containing two properties:
 * - `submittedDataByEntityName`: A record where each key is an `entityName` and the value is an array of
 *   `NewSubmittedData` or `SubmittedData` objects associated with that entity.
 * - `schemaDataByEntityName`: A record where each key is an `entityName` and the value is an array of
 *   `DataRecord[]` objects primarily intended for schema validation.
 *
 */
export const groupSchemaDataByEntityName = (data: {
	inserts?: NewSubmittedData[];
	submittedData?: SubmittedData[];
}) => {
	const combinedData = [...(data?.inserts || []), ...(data?.submittedData || [])];
	return combinedData.reduce<GroupedDataSubmission>(
		(result, submittedDataObject) => {
			const { entityName, data: recordData } = submittedDataObject;

			result.schemaDataByEntityName[entityName] = [
				...(result.schemaDataByEntityName[entityName] || []),
				{ ...recordData },
			];

			result.submittedDataByEntityName[entityName] = [
				...(result.submittedDataByEntityName[entityName] || []),
				{ ...submittedDataObject },
			];
			return result;
		},
		{ submittedDataByEntityName: {}, schemaDataByEntityName: {} },
	);
};

/**
 * Receives any object and finds if it contains an specific key
 * @param {object} hasErrorByIndex An object to evaluate
 * @param {number} index An object key
 * @returns
 */
export const hasErrorsByIndex = (hasErrorByIndex: object, index: number): boolean => {
	return has(hasErrorByIndex, index);
};

/**
 * Transforms an array of `SubmittedData` into a `Record<string, DataRecordReference[]>`,
 * where each key is the `entityName` from the `SubmittedData`, and the value is an array of
 * `DataRecordReference` objects associated with that `entityName`.
 * Edits each record that is marked to be edited on the Submission
 * @param {object} params
 * @param {SubmittedData[] | undefined} params.submittedData An array of `SubmittedData` objects to be transformed.
 * @param {Record<string, SubmissionUpdateData[]>} params.editSubmittedData An Array of `SubmittedData` objects to be updated
 * @param {Rnumber} params.submissionId The ID of the Active Submission
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mapAndMergeSubmittedDataToRecordReferences = ({
	submittedData,
	editSubmittedData,
	submissionId,
}: {
	submittedData?: SubmittedData[];
	editSubmittedData?: Record<string, SubmissionUpdateData[]>;
	submissionId: number;
}): Record<string, DataRecordReference[]> => {
	if (!submittedData) {
		return {};
	}
	return submittedData.reduce<Record<string, DataRecordReference[]>>((acc, entityData) => {
		const foundRecordToUpdateIndex =
			editSubmittedData && editSubmittedData[entityData.entityName]
				? editSubmittedData[entityData.entityName].findIndex((item) => item.systemId === entityData.systemId)
				: -1;
		let record: DataRecordReference;
		if (editSubmittedData && foundRecordToUpdateIndex >= 0) {
			const recordToUpdate = editSubmittedData[entityData.entityName][foundRecordToUpdateIndex];

			const newDataToUpdate = updateEntityData(entityData.data, recordToUpdate);

			record = {
				dataRecord: newDataToUpdate,
				reference: {
					type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
					systemId: entityData.systemId,
					submissionId,
					index: foundRecordToUpdateIndex,
				},
			};
		} else {
			record = {
				dataRecord: entityData.data,
				reference: {
					submittedDataId: entityData.id,
					type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					systemId: entityData.systemId,
				},
			};
		}
		// Initialize the array if it doesn't exist and directly push the new record
		if (!acc[entityData.entityName]) {
			acc[entityData.entityName] = [];
		}

		acc[entityData.entityName].push(record);
		return acc;
	}, {});
};

/**
 * Merges multiple arrays of `SubmittedData` and ensures uniqueness based on `id`.
 *
 * @param objects An arbitrary number of arrays of `SubmittedData`.
 * @returns
 */
export const mergeSubmittedDataAndDeduplicateById = (...objects: SubmittedData[][]): SubmittedData[] => {
	return Array.from(new Map(objects.flat().map((item) => [item.id, item])).values());
};

/**
 * Transforms an array of `SubmittedData` into a `Record<string, SubmissionDeleteData[]>`,
 * where each key is the `entityName` from the `SubmittedData`, and the value is an array of
 * `SubmissionDeleteData` objects associated with that `entityName`.
 * @param submittedData An array of `SubmittedData` objects to be transformed.
 * @returns
 */
export const transformmSubmittedDataToSubmissionDeleteData = (submittedData: SubmittedData[]) => {
	return submittedData.reduce<Record<string, SubmissionDeleteData[]>>((acc, entityData) => {
		const record = {
			data: entityData.data,
			entityName: entityData.entityName,
			isValid: entityData.isValid,
			organization: entityData.organization,
			systemId: entityData.systemId,
		};
		acc[entityData.entityName] = [...(acc[entityData.entityName] || [])].concat(record);
		return acc;
	}, {});
};

/**
 * Updates an array of existing Submitted data by applying the corresponding changes from the request update data.
 * Identifies what element in the array to update by it's `systemId`
 * @param submittedData
 * @param editData
 * @returns
 */
export const updateSubmittedDataArray = (
	submittedData: SubmittedData[],
	editData: SubmissionUpdateData[],
): SubmittedData[] => {
	return submittedData.map((existingSubmittedData) => {
		const found = editData.find((e) => e.systemId === existingSubmittedData.systemId);
		if (found) {
			const udpatedData = updateEntityData(existingSubmittedData.data, found);
			existingSubmittedData.data = udpatedData;
		}
		return existingSubmittedData;
	});
};

/**
 * Updates the entity data based on the provided update request.
 * It removes old keys, filters out undefined values from the new data,
 * and merges the new data into the current data
 * @param existingData
 * @param updateRequest
 * @returns
 */
export const updateEntityData = (existingData: DataRecord, updateRequest: SubmissionUpdateData): DataRecord => {
	// Remove old keys
	const keysToRemove = Object.keys(updateRequest.old);
	const updatedData = Object.keys(existingData).reduce<MutableDataRecord>((result, key) => {
		if (!keysToRemove.includes(key)) {
			result[key] = existingData[key];
		}
		return result;
	}, {});

	// Filter out properties with undefined values from new object
	const validNewData: DataRecord = {};
	for (const key in updateRequest.new) {
		if (updateRequest.new[key] !== undefined) {
			validNewData[key] = updateRequest.new[key];
		}
	}

	// Add new keys
	Object.assign(updatedData, validNewData);

	return updatedData;
};
