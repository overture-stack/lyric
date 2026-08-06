import type { RecordsSummaryRepository } from '../repository/submissionRecordsRepository.js';
import { type SubmissionDataSummaryWithTotal } from './types.js';

// This function accepts a raw array of submission records from the database and builds a summary response.
export const buildDataSummary = (rows: RecordsSummaryRepository[]): SubmissionDataSummaryWithTotal => {
	const initialSummary: SubmissionDataSummaryWithTotal = {
		inserts: {},
		updates: {},
		deletes: {},
		totalRecords: 0,
		errors: 0,
	};

	return rows.reduce((acc, row) => {
		const { actionType, entityName, totalRecords, batchName, errors } = row;
		const summaryItem = { batchName: batchName ?? '', recordsCount: totalRecords, errors };

		acc.totalRecords += totalRecords;
		acc.errors += errors;

		switch (actionType) {
			case 'INSERT': {
				const entitySummaries = acc.inserts ?? {};
				entitySummaries[entityName] = entitySummaries[entityName] ?? [];
				entitySummaries[entityName].push(summaryItem);
				acc.inserts = entitySummaries;
				break;
			}
			case 'UPDATE': {
				const entitySummaries = acc.updates ?? {};
				entitySummaries[entityName] = entitySummaries[entityName] ?? [];
				entitySummaries[entityName].push(summaryItem);
				acc.updates = entitySummaries;
				break;
			}
			case 'DELETE': {
				const entitySummaries = acc.deletes ?? {};
				entitySummaries[entityName] = entitySummaries[entityName] ?? { recordsCount: 0, errors: 0 };
				entitySummaries[entityName].recordsCount += totalRecords;
				entitySummaries[entityName].errors += errors;
				acc.deletes = entitySummaries;
				break;
			}
		}

		return acc;
	}, initialSummary);
};
