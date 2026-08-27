import * as _ from 'lodash-es';

import type { RecordsSummaryRepository } from '../repository/submissionRecordsRepository.js';
import {
	type DataDeletesSubmissionSummary,
	type DataInsertsSubmissionSummary,
	type DataUpdatesSubmissionSummary,
	type SubmissionDataSummaryWithTotal,
	type SubmissionSummary,
	type SubmissionSummaryResponse,
} from './types.js';

// This function accepts a raw array of submission records from the database and builds a summary response.
export const buildDataSummary = (rows: RecordsSummaryRepository[]): SubmissionDataSummaryWithTotal => {
	const inserts: Record<string, DataInsertsSubmissionSummary[]> = {};
	const updates: Record<string, DataUpdatesSubmissionSummary[]> = {};
	const deletes: Record<string, DataDeletesSubmissionSummary> = {};
	let totalRecords = 0;
	let errors = 0;

	for (const row of rows) {
		const { actionType, entityName, totalRecords: rowTotalRecords, batchName, errors: rowErrors, fileId } = row;
		const summaryItem = { batchName: batchName ?? '', errors: rowErrors, fileId, recordsCount: rowTotalRecords };

		totalRecords += rowTotalRecords;
		errors += rowErrors;

		switch (actionType) {
			case 'INSERT': {
				const entitySummaries = inserts[entityName] ?? [];
				entitySummaries.push(summaryItem);
				inserts[entityName] = entitySummaries;
				break;
			}
			case 'UPDATE': {
				const entitySummaries = updates[entityName] ?? [];
				entitySummaries.push(summaryItem);
				updates[entityName] = entitySummaries;
				break;
			}
			case 'DELETE': {
				const entitySummary = deletes[entityName] ?? { recordsCount: 0, errors: 0 };
				entitySummary.recordsCount += rowTotalRecords;
				entitySummary.errors += rowErrors;
				deletes[entityName] = entitySummary;
				break;
			}
		}
	}

	return {
		inserts,
		updates,
		deletes,
		totalRecords,
		errors,
	};
};

/**
 * Utility to convert a raw Submission record to a Response type
 * @param {SubmissionSummary} submission
 * @returns {SubmissionSummaryResponse}
 */
export const createSubmissionSummaryResponse = (submission: SubmissionSummary): SubmissionSummaryResponse => {
	return {
		id: submission.id,
		data: submission.data,
		dictionary: submission.dictionary,
		dictionaryCategory: submission.dictionaryCategory,
		organization: submission.organization,
		status: submission.status,
		createdAt: _.toString(submission.createdAt?.toISOString()),
		createdBy: _.toString(submission.createdBy),
		updatedAt: _.toString(submission.updatedAt?.toISOString()),
		updatedBy: _.toString(submission.updatedBy),
	};
};
