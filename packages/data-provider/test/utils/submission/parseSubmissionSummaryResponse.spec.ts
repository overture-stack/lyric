import { expect } from 'chai';
import { describe, it } from 'mocha';

import { parseSubmissionSummaryResponse } from '../../../src/utils/submissionUtils.js';
import { SUBMISSION_STATUS, type SubmissionSummaryRepository } from '../../../src/utils/types.js';

describe('Submission Utils - Parse a Submission object to a Summary of the Active Submission', () => {
	const todaysDate = new Date();
	it('should return a Summary without any data ', () => {
		const SubmissionSummaryRepository: SubmissionSummaryRepository = {
			id: 4,
			data: {},
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
		const response = parseSubmissionSummaryResponse(SubmissionSummaryRepository);
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
		const SubmissionSummaryRepository: SubmissionSummaryRepository = {
			id: 3,
			data: {
				inserts: {
					books: {
						batchName: 'books.tsv',
						records: [
							{
								title: 'abc',
							},
						],
					},
				},
				updates: {
					books: [
						{
							systemId: 'QWE987',
							new: { title: 'The Little Prince' },
							old: { title: 'the little prince' },
						},
					],
				},
				deletes: {
					books: [
						{
							systemId: 'ZXC678',
							entityName: 'books',
							organization: 'oicr',
							isValid: true,
							data: { title: 'batman' },
						},
					],
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
		const response = parseSubmissionSummaryResponse(SubmissionSummaryRepository);
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
