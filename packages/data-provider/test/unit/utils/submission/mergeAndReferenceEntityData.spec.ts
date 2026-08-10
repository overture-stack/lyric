import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Submission, SubmittedData } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { mergeAndReferenceEntityData } from '../../../../src/utils/submissionUtils.js';
import { MERGE_REFERENCE_TYPE, SUBMISSION_STATUS } from '../../../../src/utils/types.js';
import { assertExists } from '../../../assertions.js';

describe('Submission Utils - Combine Active Submission and the Submitted Data with reference', () => {
	const todaysDate = new Date();
	it('returns only SubmittedData data when Submission doesnt contain data', () => {
		const originalSubmission: Submission = {
			id: 2,
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionRecordWithEntityName[] = [];
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
		assertExists(response['animals']);
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
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'INSERT',
				entityName: 'animals',
				id: 8,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { name: 'elephant', color: 'gray' },
			},
			{
				actionType: 'INSERT',
				entityName: 'animals',
				id: 9,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { name: 'beaver', color: 'brown' },
			},
		];
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
		assertExists(response['animals']);
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
					recordId: 8,
					submissionId: originalSubmission.id,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
				},
			},
			{
				dataRecord: { name: 'beaver', color: 'brown' },
				reference: {
					recordId: 9,
					submissionId: originalSubmission.id,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
				},
			},
		]);
	});
	it('returns combination of SubmittedData and Submission update data', () => {
		const originalSubmission: Submission = {
			id: 2,
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', new: { color: 'brown' }, old: { color: 'black' } },
			},
		];
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
			submissionData: submissionRecords,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(1);
		expect(Object.keys(response)).to.eql(['animals']);
		assertExists(response['animals']);
		expect(response['animals'].length).eq(2);
		expect(response['animals']).eql([
			{
				dataRecord: { name: 'tiger', color: 'orange' },
				reference: {
					systemId: 'TGR1425',
					submissionId: 2,
					recordId: 10,
					type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
				},
			},
			{
				dataRecord: { name: 'bear', color: 'brown' },
				reference: {
					systemId: 'BR8912',
					submissionId: 2,
					recordId: 11,
					type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
				},
			},
		]);
	});
	it('returns combination of SubmittedData and Submission delete data', () => {
		const originalSubmission: Submission = {
			id: 2,
			dictionaryId: 14,
			dictionaryCategoryId: 20,
			organization: 'zoo',
			status: SUBMISSION_STATUS.OPEN,
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};
		const submissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 13,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', data: { name: 'bear', color: 'black' }, isValid: true, organization: 'zoo' },
			},
		];
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
			submissionData: submissionRecords,
			submittedData,
		});
		expect(Object.keys(response).length).to.eq(0);
		expect(response).eql({});
	});
});
