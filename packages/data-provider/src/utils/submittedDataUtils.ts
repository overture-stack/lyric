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
} from '@overture-stack/lyric-data-model';

import {
	DataRecordReference,
	type GroupedDataSubmission,
	MERGE_REFERENCE_TYPE,
	type MutableDataDiff,
	type MutableDataRecord,
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
 * Abstract Error response
 * @param error
 * @returns
 */
export const fetchDataErrorResponse = (
	error: string,
): {
	data: [];
	metadata: { totalRecords: number; errorMessage?: string };
} => {
	return {
		data: [],
		metadata: {
			totalRecords: 0,
			errorMessage: error,
		},
	};
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
	if (!submittedData) return {};
	return submittedData.reduce<Record<string, DataRecordReference[]>>((acc, entityData) => {
		const foundRecordToUpdateIndex =
			editSubmittedData && editSubmittedData[entityData.entityName]
				? editSubmittedData[entityData.entityName].findIndex((item) => item.systemId === entityData.systemId)
				: -1;
		let record: DataRecordReference;
		if (editSubmittedData && foundRecordToUpdateIndex >= 0) {
			const recordToUpdate = editSubmittedData[entityData.entityName][foundRecordToUpdateIndex];
			const newDataToUpdate: MutableDataRecord = entityData.data;
			for (const key of Object.keys(recordToUpdate.old)) {
				if (entityData.data[key] !== recordToUpdate.old[key]) {
					// What to do if record on Submission doesn't match with current SubmittedData?
				}
				newDataToUpdate[key] = recordToUpdate.new[key];
			}
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

export const updateSubmittedDataArray = (
	submittedData: SubmittedData[],
	editData: SubmissionUpdateData[],
): SubmittedData[] => {
	return submittedData.map((existingSubmittedData) => {
		const found = editData.find((e) => e.systemId === existingSubmittedData.systemId);
		if (found) {
			const newData: MutableDataRecord = existingSubmittedData.data;
			for (const key of Object.keys(found.old)) {
				newData[key] = found.new[key];
			}
			existingSubmittedData.data = newData;
			return existingSubmittedData;
		}
		return existingSubmittedData;
	});
};
