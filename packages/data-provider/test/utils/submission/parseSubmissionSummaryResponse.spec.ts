import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createSubmissionSummaryResponse } from '../../../src/utils/submissionUtils.js';
import { SUBMISSION_STATUS, type SubmissionDataSummaryRepositoryRecord } from '../../../src/utils/types.js';

describe('Submission Utils - Parse a Submission object to a Summary of the Active Submission', () => {
	const todaysDate = new Date();
	it('should return a Summary without any data ', () => {
		const submissionDataSummaryRepositoryRecord: SubmissionDataSummaryRepositoryRecord = {
			id: 4,
			data: {
				inserts: undefined,
				updates: undefined,
				deletes: undefined,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
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
				inserts: undefined,
				updates: undefined,
				deletes: undefined,
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
	it('should return a Summary with insert, update and delete data ', () => {
		const submissionDataSummaryRepositoryRecord: SubmissionDataSummaryRepositoryRecord = {
			id: 3,
			data: {
				inserts: {
					books: {
						batchName: 'books.tsv',
						recordsCount: 1,
					},
				},
				updates: {
					books: {
						recordsCount: 1,
					},
				},
				deletes: {
					books: {
						recordsCount: 1,
					},
				},
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
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
					books: {
						batchName: 'books.tsv',
						recordsCount: 1,
					},
				},
				updates: {
					books: {
						recordsCount: 1,
					},
				},
				deletes: {
					books: {
						recordsCount: 1,
					},
				},
			},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.VALID,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
});
