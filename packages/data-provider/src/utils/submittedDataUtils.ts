import { groupBy, has } from 'lodash-es';

import {
	type DataDiff,
	NewSubmittedData,
	type SubmissionDeleteData,
	SubmittedData,
} from '@overture-stack/lyric-data-model';
import { type DataRecord, SchemaValidationError } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import {
	DataRecordReference,
	type GroupedDataSubmission,
	MERGE_REFERENCE_TYPE,
	type MutableDataDiff,
	type SubmittedDataResponse,
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
 * Get all the schema errors grouped by the index of the record
 * @param {SchemaValidationError[]} schemaValidationErrors
 * @returns
 */
export const groupErrorsByIndex = (schemaValidationErrors: readonly SchemaValidationError[]) => {
	return groupBy(schemaValidationErrors, 'index');
};

/**
 * Groups `NewSubmittedData` and `SubmittedData` objects by their `entityName` field.
 * @param data An object containing arrays of `NewSubmittedData` and `SubmittedData` objects.
 * @returns An object containing two properties:
 * - `submittedDataByEntityName`: A record where each key is an `entityName` and the value is an array of
 *   `NewSubmittedData` or `SubmittedData` objects associated with that entity.
 * - `schemaDataByEntityName`: A record where each key is an `entityName` and the value is an array of
 *   `SchemaData` objects primarily intended for schema validation.
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
 * Parses an array of SubmittedData objects into a more compact form used as a respone
 * @param {SubmittedData[]} submittedData
 * @returns {SubmittedDataResponse[]}
 */
export const mapRecordsSubmittedDataResponse = (submittedData: SubmittedData[]): SubmittedDataResponse[] => {
	return submittedData.map((data) => ({
		data: data.data,
		entityName: data.entityName,
		isValid: data.isValid,
		organization: data.organization,
		systemId: data.systemId,
	}));
};

/**
 * Transforms an array of `SubmittedData` into a `Record<string, DataRecordReference[]>`,
 * where each key is the `entityName` from the `SubmittedData`, and the value is an array of
 * `DataRecordReference` objects associated with that `entityName`.
 * @param {SubmittedData[] | undefined} submittedData An array of `SubmittedData` objects to be transformed.
 * @returns {Record<string, DataRecordReference[]>}
 */
export const transformSubmittedDataSchemaByEntityName = (
	submittedData: SubmittedData[] | undefined,
): Record<string, DataRecordReference[]> => {
	if (!submittedData) return {};

	return submittedData.reduce<Record<string, DataRecordReference[]>>((acc, entityData) => {
		const record = {
			dataRecord: entityData.data,
			reference: {
				submittedDataId: entityData.id,
				type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
			},
		};

		acc[entityData.entityName] = [...(acc[entityData.entityName] || [])].concat(record);
		return acc;
	}, {});
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
