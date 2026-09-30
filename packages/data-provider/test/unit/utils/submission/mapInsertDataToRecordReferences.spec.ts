import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionInsertRecordWithEntityName } from '../../../../index.js';
import { mapInsertDataToRecordReferences } from '../../../../src/utils/submissionUtils.js';
import { MERGE_REFERENCE_TYPE } from '../../../../src/utils/types.js';
import { assertExists } from '../../../assertions.js';

describe('Submission Utils - Transforms inserts from the Submission object into a Record grouped by entityName', () => {
	it('should return an object grouped by entity name with 2 records', () => {
		const insertDataEntity: SubmissionInsertRecordWithEntityName[] = [
			{
				data: {
					name: 'Lamborghini Murcielago',
				},
				entityName: 'cars',
				recordId: 100,
			},
			{
				data: {
					name: 'Lamborghini Gallardo',
				},
				entityName: 'cars',
				recordId: 101,
			},
		];

		const response = mapInsertDataToRecordReferences(100, insertDataEntity);
		expect(Object.keys(response).length).to.eq(1);
		expect(response['cars']).to.eql([
			{
				dataRecord: {
					name: 'Lamborghini Murcielago',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 100,
				},
			},
			{
				dataRecord: {
					name: 'Lamborghini Gallardo',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 101,
				},
			},
		]);
	});
	it('should return an array of 4 record references', () => {
		const submissionInsertRecords: SubmissionInsertRecordWithEntityName[] = [
			{
				data: { name: 'Lamborghini Murcielago' },
				entityName: 'cars',
				recordId: 100,
			},
			{
				data: { name: 'Lamborghini Gallardo' },
				entityName: 'cars',
				recordId: 101,
			},
			{
				data: { name: 'Cat' },
				entityName: 'animals',
				recordId: 102,
			},
			{
				data: { name: 'Dog' },
				entityName: 'animals',
				recordId: 103,
			},
		];

		const response = mapInsertDataToRecordReferences(100, submissionInsertRecords);
		expect(Object.keys(response).length).to.eq(2);
		assertExists(response['cars']);
		assertExists(response['animals']);
		expect(response['cars'].length).to.eq(2);
		expect(response['animals'].length).to.eq(2);
		expect(response['cars']).to.eql([
			{
				dataRecord: {
					name: 'Lamborghini Murcielago',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 100,
				},
			},
			{
				dataRecord: {
					name: 'Lamborghini Gallardo',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 101,
				},
			},
		]);
		expect(response['animals']).to.eql([
			{
				dataRecord: {
					name: 'Cat',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 102,
				},
			},
			{
				dataRecord: {
					name: 'Dog',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: 103,
				},
			},
		]);
	});
	it('should return an empty array', () => {
		const submissionInsertRecords: SubmissionInsertRecordWithEntityName[] = [];

		const response = mapInsertDataToRecordReferences(103, submissionInsertRecords);
		expect(Object.keys(response).length).to.eql(0);
	});
});
