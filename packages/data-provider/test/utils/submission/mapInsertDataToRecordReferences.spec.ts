import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

import { mapInsertDataToRecordReferences } from '../../../src/utils/submissionUtils.js';
import { MERGE_REFERENCE_TYPE } from '../../../src/utils/types.js';

describe('Submission Utils - Transforms inserts from the Submission object into a Record grouped by entityName', () => {
	it('should return an object grouped by entity name with 2 records', () => {
		const submissionInsertData: SubmissionInsertData = {
			batchName: 'cars.tsv',
			records: [
				{
					name: 'Lamborghini Murcielago',
				},
				{
					name: 'Lamborghini Gallardo',
				},
			],
		};

		const response = mapInsertDataToRecordReferences(100, { cars: submissionInsertData });
		expect(Object.keys(response)).to.eql(['cars']);
		expect(response['cars'].length).to.eq(2);
		expect(response['cars']).to.eql([
			{
				dataRecord: {
					name: 'Lamborghini Murcielago',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					index: 0,
				},
			},
			{
				dataRecord: {
					name: 'Lamborghini Gallardo',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					index: 1,
				},
			},
		]);
	});
	it('should return 2 objects grouped by entity names with 2 records each one', () => {
		const submissionInsertDataCars: SubmissionInsertData = {
			batchName: 'cars.tsv',
			records: [
				{
					name: 'Lamborghini Murcielago',
				},
				{
					name: 'Lamborghini Gallardo',
				},
			],
		};

		const submissionInsertDataAnimals: SubmissionInsertData = {
			batchName: 'animals.tsv',
			records: [
				{
					name: 'Cat',
				},
				{
					name: 'Dog',
				},
			],
		};

		const response = mapInsertDataToRecordReferences(100, {
			cars: submissionInsertDataCars,
			animals: submissionInsertDataAnimals,
		});
		expect(Object.keys(response)).to.eql(['cars', 'animals']);
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
					index: 0,
				},
			},
			{
				dataRecord: {
					name: 'Lamborghini Gallardo',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					index: 1,
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
					index: 0,
				},
			},
			{
				dataRecord: {
					name: 'Dog',
				},
				reference: {
					submissionId: 100,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					index: 1,
				},
			},
		]);
	});
	it('should return an objects grouped by entity names with zero records', () => {
		const submissionInsertDataFruits: SubmissionInsertData = {
			batchName: 'fruit.tsv',
			records: [],
		};

		const response = mapInsertDataToRecordReferences(101, {
			fruit: submissionInsertDataFruits,
		});
		expect(Object.keys(response)).to.eql(['fruit']);
		expect(response['fruit'].length).to.eq(0);
		expect(response['fruit']).to.eql([]);
	});
	it('should return an empty object', () => {
		const submissionInsertDataFruits: SubmissionInsertData = {
			batchName: '',
			records: [],
		};

		const response = mapInsertDataToRecordReferences(103, {
			'': submissionInsertDataFruits,
		});
		expect(Object.keys(response)).to.eql(['']);
		expect(response[''].length).to.eq(0);
		expect(response['']).to.eql([]);
	});
});
