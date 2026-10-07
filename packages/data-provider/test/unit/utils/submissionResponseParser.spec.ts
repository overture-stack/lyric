import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { RecordsSummaryRepository } from '../../../src/repository/submissionRecordsRepository.js';
import { buildDataSummary } from '../../../src/utils/submissionResponseParser.js';

describe('buildDataSummary', () => {
	it('should return an empty summary when given no rows', () => {
		const result = buildDataSummary([]);

		expect(result).to.eql({
			inserts: {},
			updates: {},
			deletes: {},
			totalRecords: 0,
			errors: 0,
		});
	});

	it('should group insert and update rows by entity name and accumulate totals', () => {
		const rows: RecordsSummaryRepository[] = [
			{ actionType: 'INSERT', entityName: 'sport', totalRecords: 3, batchName: 'batch1.tsv', errors: 0, fileId: 1 },
			{ actionType: 'INSERT', entityName: 'sport', totalRecords: 2, batchName: 'batch2.tsv', errors: 1, fileId: 2 },
			{ actionType: 'UPDATE', entityName: 'player', totalRecords: 5, batchName: 'batch3.tsv', errors: 0, fileId: 3 },
		];

		const result = buildDataSummary(rows);

		expect(result).to.eql({
			inserts: {
				sport: [
					{ batchName: 'batch1.tsv', recordsCount: 3, errors: 0, fileId: 1 },
					{ batchName: 'batch2.tsv', recordsCount: 2, errors: 1, fileId: 2 },
				],
			},
			updates: {
				player: [{ batchName: 'batch3.tsv', recordsCount: 5, errors: 0, fileId: 3 }],
			},
			deletes: {},
			totalRecords: 10,
			errors: 1,
		});
	});

	it('should aggregate delete rows for the same entity instead of listing them individually', () => {
		const rows: RecordsSummaryRepository[] = [
			{ actionType: 'DELETE', entityName: 'sport', totalRecords: 2, batchName: 'batch1.tsv', errors: 0, fileId: 1 },
			{ actionType: 'DELETE', entityName: 'sport', totalRecords: 1, batchName: 'batch2.tsv', errors: 1, fileId: 2 },
		];

		const result = buildDataSummary(rows);

		expect(result.deletes).to.eql({
			sport: { recordsCount: 3, errors: 1 },
		});
		expect(result.totalRecords).to.eq(3);
		expect(result.errors).to.eq(1);
	});

	it('should default a missing batchName to an empty string', () => {
		const rows: RecordsSummaryRepository[] = [
			{ actionType: 'INSERT', entityName: 'sport', totalRecords: 1, errors: 0, fileId: 1 },
		];

		const result = buildDataSummary(rows);

		expect(result.inserts).to.eql({
			sport: [{ batchName: '', recordsCount: 1, errors: 0, fileId: 1 }],
		});
	});
});
