import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { DataRecord } from '@overture-stack/lectern-client';

import { createBatchResponse } from '../../../src/utils/submissionResponseParser.js';
import { createSubmissionDetailsResponse } from '../../../src/utils/submissionUtils.js';
import { SUBMISSION_STATUS, type SubmissionDataDetailsRepositoryRecord } from '../../../src/utils/types.js';

describe('Submission Utils - Parse a Submisison object to a response format', () => {
	const todaysDate = new Date();
	it('return a Submission response with no data', () => {
		const submissionRepositoryRecord: SubmissionDataDetailsRepositoryRecord = {
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
		const response = createSubmissionDetailsResponse(submissionRepositoryRecord);
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
		const submissionRepositoryRecord: SubmissionDataDetailsRepositoryRecord = {
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
		const response = createSubmissionDetailsResponse(submissionRepositoryRecord);
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

	describe('Create Submission Insert Response', () => {
		it('should return a Submission Insert Response with records', () => {
			const records: DataRecord[] = [
				{ id: 1, name: 'ABC' },
				{ id: 2, name: 'XYZ' },
			];
			const result = createBatchResponse('sample', records);
			expect(result.batchName).eql('sample');
			expect(result.records.length).eql(2);
			expect(result.records).eql([
				{ id: 1, name: 'ABC' },
				{ id: 2, name: 'XYZ' },
			]);
		});
		it('should return a Submission Insert Response with no records', () => {
			const result = createBatchResponse('sample', []);
			expect(result).eql({ batchName: 'sample', records: [] });
		});
	});
});
