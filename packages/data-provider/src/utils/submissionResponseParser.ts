import type { DataRecord } from '@overture-stack/lectern-client';
import type {
	SubmissionData,
	SubmissionDeleteData,
	SubmissionErrors,
	SubmissionInsertData,
	SubmissionRecordErrorDetails,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import { type PaginationOptions, type SubmissionActionType } from './types.js';

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};

export type FlattenedSubmissionData =
	| { type: 'INSERTS'; entity: string; value: DataRecord; index: number }
	| { type: 'UPDATES'; entity: string; value: SubmissionUpdateData; index: number }
	| { type: 'DELETES'; entity: string; value: SubmissionDeleteData; index: number };

/**
 * Filters and paginates submission `data` and `errors` based on specified action types and entity names.
 * Returns the paginated data along with the corresponding filtered errors.
 */
export const filterAndPaginateSubmissionData = ({
	data,
	errors,
	filterOptions,
	paginationOptions,
}: {
	data: SubmissionData;
	errors: SubmissionErrors;
	filterOptions: {
		actionTypes: SubmissionActionType[];
		entityNames: string[];
	};
	paginationOptions: PaginationOptions;
}): { data: FlattenedSubmissionData[]; errors: SubmissionRecordErrorDetails[] } => {
	const { page, pageSize } = paginationOptions;
	const { actionTypes, entityNames } = filterOptions;

	const flattenedRecords = flattenData(data, actionTypes, entityNames);

	const startIndex = (page - 1) * pageSize;
	const paginatedRecords = flattenedRecords.slice(startIndex, startIndex + pageSize);

	// Extract indexes that belongs to paginated records
	const paginatedRecordIndexes = paginatedRecords.map((record) => record.index);
	const relevantErrors = getFilteredErrors({
		errors: errors || {},
		actionTypes,
		entityNames,
		indices: paginatedRecordIndexes,
	});

	return { data: paginatedRecords, errors: relevantErrors };
};

/**
 * Flattens submission data into a list of records based on specified action types and entity names.
 */
const flattenData = (
	data: SubmissionData,
	actionTypes: SubmissionActionType[],
	entityNames: string[],
): FlattenedSubmissionData[] => {
	const list: FlattenedSubmissionData[] = [];

	for (const action of actionTypes) {
		const bucket = getActionData(data, action);

		if (!bucket) {
			continue;
		}

		for (const [entity, value] of Object.entries(bucket)) {
			if (!entityNames.includes(entity) || !value) {
				continue;
			}

			if (action === 'INSERTS') {
				for (const [index, record] of value.records.entries()) {
					list.push({ type: 'INSERTS', entity, value: record, index });
				}
				continue;
			}

			for (const [index, record] of value) {
				list.push({ type: action, entity, value: record, index });
			}
		}
	}

	return list;
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
 * Filters submission errors based on specified action types, entity names, and record indices.
 */
export const getFilteredErrors = ({
	errors,
	actionTypes,
	entityNames,
	indices,
}: {
	errors: SubmissionErrors;
	actionTypes: SubmissionActionType[];
	entityNames: string[];
	indices: number[];
}): SubmissionRecordErrorDetails[] => {
	const allErrors: SubmissionRecordErrorDetails[] = [];

	for (const actionType of actionTypes) {
		const bucket = getActionErrors(errors, actionType);

		if (bucket) {
			for (const [entityName, records] of Object.entries(bucket)) {
				if (!entityNames.includes(entityName)) {
					continue;
				}

				for (const record of records) {
					allErrors.push(record);
				}
			}
		}
	}

	return allErrors.filter((err) => indices.includes(err.index));
};
