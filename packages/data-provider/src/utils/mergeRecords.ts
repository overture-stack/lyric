import type { DataRecord } from '@overture-stack/lectern-client';
import type {
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import { deepCompare } from './formatUtils.js';

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
