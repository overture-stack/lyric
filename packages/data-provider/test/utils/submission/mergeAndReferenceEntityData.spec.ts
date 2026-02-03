import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Submission, SubmissionData, SubmittedData } from '@overture-stack/lyric-data-model/models';

import { mergeAndReferenceEntityData } from '../../../src/utils/submissionUtils.js';
import { MERGE_REFERENCE_TYPE, SUBMISSION_STATUS } from '../../../src/utils/types.js';

describe('Submission Utils - Combine Active Submission and the Submitted Data with reference', () => {
	const todaysDate = new Date();
	it('returns only SubmittedData data when Submission doesnt contain data', () => {
		const originalSubmission: Submission = {
			id: 2,
			data: {},
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			errors: {},
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionData = {};
		const submittedData: SubmittedData[] = [
			{
				id: 5,
				data: { name: 'tiger', color: 'yellow' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'TGR1425',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		];
		const response = mergeAndReferenceEntityData({
			submissionId: originalSubmission.id,
			submissionData,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(1);
		expect(Object.keys(response)).to.eql(['animals']);
		expect(response['animals'].length).eq(1);
		expect(response['animals']).eql([
			{
				dataRecord: { name: 'tiger', color: 'yellow' },
				reference: {
					systemId: 'TGR1425',
					submittedDataId: 5,
					type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
				},
			},
		]);
	});
	it('returns combination of SubmittedData and Submission insert data', () => {
		const originalSubmission: Submission = {
			id: 2,
			data: {},
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			errors: {},
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionData = {
			inserts: {
				animals: {
					batchName: 'animals.tsv',
					records: [
						{ name: 'elephant', color: 'gray' },
						{ name: 'beaver', color: 'brown' },
					],
				},
			},
		};
		const submittedData: SubmittedData[] = [
			{
				id: 5,
				data: { name: 'tiger', color: 'yellow' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'TGR1425',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		];
		const response = mergeAndReferenceEntityData({
			submissionId: originalSubmission.id,
			submissionData,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(1);
		expect(Object.keys(response)).to.eql(['animals']);
		expect(response['animals'].length).eq(3);
		expect(response['animals']).eql([
			{
				dataRecord: { name: 'tiger', color: 'yellow' },
				reference: {
					systemId: 'TGR1425',
					submittedDataId: 5,
					type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
				},
			},
			{
				dataRecord: { name: 'elephant', color: 'gray' },
				reference: {
					index: 0,
					submissionId: 2,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
				},
			},
			{
				dataRecord: { name: 'beaver', color: 'brown' },
				reference: {
					index: 1,
					submissionId: 2,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
				},
			},
		]);
	});
	it('returns combination of SubmittedData and Submission update data', () => {
		const originalSubmission: Submission = {
			id: 2,
			data: {},
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			errors: {},
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionData = {
			updates: {
				animals: [
					{ systemId: 'TGR1425', old: { color: 'yellow' }, new: { color: 'orange' } },
					{ systemId: 'BR8912', old: { color: 'black' }, new: { color: 'brown' } },
				],
			},
		};
		const submittedData: SubmittedData[] = [
			{
				id: 5,
				data: { name: 'tiger', color: 'yellow' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'TGR1425',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
			{
				id: 6,
				data: { name: 'bear', color: 'black' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'BR8912',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		];
		const response = mergeAndReferenceEntityData({
			submissionId: originalSubmission.id,
			submissionData,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(1);
		expect(Object.keys(response)).to.eql(['animals']);
		expect(response['animals'].length).eq(2);
		expect(response['animals']).eql([
			{
				dataRecord: { name: 'tiger', color: 'orange' },
				reference: {
					systemId: 'TGR1425',
					submissionId: 2,
					index: 0,
					type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
				},
			},
			{
				dataRecord: { name: 'bear', color: 'brown' },
				reference: {
					systemId: 'BR8912',
					submissionId: 2,
					index: 1,
					type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
				},
			},
		]);
	});
	it('returns combination of SubmittedData and Submission delete data', () => {
		const originalSubmission: Submission = {
			id: 2,
			data: {},
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			errors: {},
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionData = {
			deletes: {
				animals: [
					{
						systemId: 'TGR1425',
						data: { name: 'tiger', color: 'yellow' },
						entityName: 'animals',
						isValid: true,
						organization: 'zoo',
					},
					{
						systemId: 'BR8912',
						data: { name: 'bear', color: 'black' },
						entityName: 'animals',
						isValid: true,
						organization: 'zoo',
					},
				],
			},
		};
		const submittedData: SubmittedData[] = [
			{
				id: 5,
				data: { name: 'tiger', color: 'yellow' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'TGR1425',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
			{
				id: 6,
				data: { name: 'bear', color: 'black' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'BR8912',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		];
		const response = mergeAndReferenceEntityData({
			submissionId: originalSubmission.id,
			submissionData,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(0);
		expect(response).eql({});
	});
});
