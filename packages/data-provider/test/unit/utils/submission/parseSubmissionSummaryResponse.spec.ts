import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createSubmissionSummaryResponse } from '../../../../src/utils/submissionResponseParser.js';
import { SUBMISSION_STATUS, type SubmissionSummary } from '../../../../src/utils/types.js';

describe('Submission Utils - Parse a Submission object to a Summary of the Active Submission', () => {
	const todaysDate = new Date();
	it('should return a Summary without any data ', () => {
		const submissionDataSummaryRepositoryRecord: SubmissionSummary = {
			id: 4,
			data: {
				totalRecords: 0,
				errors: 0,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const response = createSubmissionSummaryResponse(submissionDataSummaryRepositoryRecord);
		expect(response).to.eql({
			id: 4,
			data: {
				totalRecords: 0,
				errors: 0,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
	it('should return a Summary with insert, update and delete data ', () => {
		const submissionDataSummaryRepositoryRecord: SubmissionSummary = {
			id: 3,
			data: {
				inserts: {
					books: [
						{
							batchName: 'books.tsv',
							recordsCount: 1,
							errors: 0,
						},
					],
				},
				updates: {
					books: [
						{
							batchName: 'books.tsv',
							recordsCount: 1,
							errors: 0,
						},
					],
				},
				deletes: {
					books: {
						recordsCount: 1,
						errors: 0,
					},
				},
				totalRecords: 3,
				errors: 0,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const response = createSubmissionSummaryResponse(submissionDataSummaryRepositoryRecord);
		expect(response).to.eql({
			id: 3,
			data: {
				inserts: {
					books: [
						{
							batchName: 'books.tsv',
							recordsCount: 1,
							errors: 0,
						},
					],
				},
				updates: {
					books: [
						{
							batchName: 'books.tsv',
							recordsCount: 1,
							errors: 0,
						},
					],
				},
				deletes: {
					books: {
						recordsCount: 1,
						errors: 0,
					},
				},
				totalRecords: 3,
				errors: 0,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
});
