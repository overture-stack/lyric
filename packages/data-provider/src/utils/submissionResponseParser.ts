import type { DataRecord } from '@overture-stack/lectern-client';
import type {
	SubmissionData,
	SubmissionDeleteData,
	SubmissionErrors,
	SubmissionInsertData,
	SubmissionRecordErrorDetails,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import { type SubmissionActionType } from './types.js';

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};

/**
 * Retrieves the set of submission data corresponding to a specific action type.
 */
export const getActionData = (data: SubmissionData, actionType: SubmissionActionType) => {
	switch (actionType) {
		case 'INSERTS':
			return data.inserts ?? {};

		case 'UPDATES':
			return data.updates ?? {};

		case 'DELETES':
			return data.deletes ?? {};
	}
};

/**
 * Retrieves the set of submission errors corresponding to a specific action type.
 */
export const getActionErrors = (errors: SubmissionErrors, actionType: SubmissionActionType) => {
	switch (actionType) {
		case 'INSERTS':
			return errors.inserts ?? {};

		case 'UPDATES':
			return errors.updates ?? {};

		case 'DELETES':
			return errors.deletes ?? {};
	}
};

/**
 * Normalize an entity's value to an array of records.
 * Handles insert/update/delete shapes for both data and errors.
 */
export const normalizeRecords = (
	value: SubmissionInsertData | SubmissionUpdateData[] | SubmissionDeleteData[],
): (DataRecord | SubmissionDeleteData | SubmissionUpdateData)[] => {
	return 'records' in value ? value.records : value;
};

/**
 * Returns all submission errors whose `index` is between
 * the specified inclusive range
 * @param errors - The full list of submission record errors.
 * @param start - The starting index (inclusive).
 * @param end - The ending index (inclusive).
 * @returns An array containing only the errors whose `index` is between `start` and `end`.
 */
export const getErrorsInRange = (errors: SubmissionRecordErrorDetails[], start: number, end: number) => {
	return errors.filter(({ index }) => index >= start && index <= end);
};
