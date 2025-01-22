import { expect } from 'chai';
import { describe, it } from 'mocha';

import { parseSubmissionResponse } from '../../../src/utils/submissionUtils.js';
import { SUBMISSION_STATUS, type SubmissionSummaryRepository } from '../../../src/utils/types.js';

describe('Submission Utils - Parse a Submisison object to a response format', () => {
	const todaysDate = new Date();
	it('return a Submission response with no data', () => {
		const SubmissionSummaryRepository: SubmissionSummaryRepository = {
			id: 2,
			data: {},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const response = parseSubmissionResponse(SubmissionSummaryRepository);
		expect(response).to.eql({
			id: 2,
			data: {},
			dictionary: { name: 'books', version: '1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
	it('return a Submission response format with insert, update and delete data', () => {
		const SubmissionSummaryRepository: SubmissionSummaryRepository = {
			id: 2,
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
			dictionary: { name: 'books', version: '1.1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const response = parseSubmissionResponse(SubmissionSummaryRepository);
		expect(response).to.eql({
			id: 2,
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
			dictionary: { name: 'books', version: '1.1' },
			dictionaryCategory: { name: 'favorite books', id: 1 },
			errors: {},
			organization: 'oicr',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate.toISOString(),
			createdBy: 'me',
			updatedAt: '',
			updatedBy: '',
		});
	});
});
