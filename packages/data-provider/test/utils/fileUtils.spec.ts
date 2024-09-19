import { expect } from 'chai';
import fs from 'fs';
import { describe, it } from 'mocha';
import sinon from 'sinon';

const fsPromises = fs.promises;

import type { Schema } from '@overture-stack/lectern-client';

import { tsvToJson } from '../../src/utils/fileUtils.js';

describe('File Utils', () => {
	beforeEach(() => {
		sinon.restore();
	});

	describe('Convert any text file into a json', () => {
		const schema: Schema = {
			name: 'participant',
			fields: [
				{
					name: 'study_id',
					valueType: 'string',
					restrictions: [{ required: true }],
				},
				{
					name: 'submitter_participant_id',
					valueType: 'string',
					restrictions: [{ required: true }],
				},
				{
					name: 'sex_at_birth',
					valueType: 'string',
					restrictions: [
						{
							codeList: ['Male', 'Female'],
						},
					],
				},
				{
					name: 'age',
					valueType: 'integer',
					restrictions: [{ required: true }],
				},
			],
		};
		it('should read a .tsv file and parse it to JSON format', async () => {
			const archiveAsTsv =
				'study_id\tsubmitter_participant_id\tsex_at_birth\tage\nTESTABC\tNR-01\tMale\t21\nTESTABC\tNR-02\tFemale\t18';

			sinon.stub(fsPromises, 'readFile').resolves(archiveAsTsv);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			const expectedJsonParsed = [
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-01',
					sex_at_birth: 'Male',
					age: 21,
				},
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-02',
					sex_at_birth: 'Female',
					age: 18,
				},
			];

			expect(Object.keys(jsonParsed).length).to.eq(1);
			expect(Object.keys(jsonParsed)).to.eql(['records']);
			expect(jsonParsed.errors).to.be.undefined;
			expect(jsonParsed.records.length).to.eq(2);
			expect(jsonParsed.records).to.eql(expectedJsonParsed);
		});
		// 	const csvFile =
		// 		'study_id,submitter_participant_id,sex_at_birth,age\nTESTABC,NR-01,Male,21\nTESTABC,NR-02,Female,18';

		// 	sinon.stub(fsPromises, 'readFile').resolves(csvFile);

		// 	const schema: Schema = {
		// 		name: 'participant',
		// 		fields: [
		// 			{
		// 				name: 'study_id',
		// 				valueType: 'string',
		// 				restrictions: [{ required: true }],
		// 			},
		// 			{
		// 				name: 'submitter_participant_id',
		// 				valueType: 'string',
		// 				restrictions: [{ required: true }],
		// 			},
		// 			{
		// 				name: 'sex_at_birth',
		// 				valueType: 'string',
		// 				restrictions: [
		// 					{
		// 						codeList: ['Male', 'Female'],
		// 					},
		// 				],
		// 			},
		// 			{
		// 				name: 'age',
		// 				valueType: 'integer',
		// 				restrictions: [{ required: true }],
		// 			},
		// 		],
		// 	};

		// 	const jsonParsed = await tsvToJson('particpant.tsv', schema);

		// 	const expectedJsonParsed = [
		// 		{
		// 			'study_id,submitter_participant_id,sex_at_birth,age': 'TESTABC,NR-01,Male,21',
		// 		},
		// 		{
		// 			'study_id,submitter_participant_id,sex_at_birth,age': 'TESTABC,NR-02,Female,18',
		// 		},
		// 	];

		// 	expect(jsonParsed).to.be.eql(expectedJsonParsed);
		// });

		it('should return empty array if file has no content', async () => {
			const emptyFile = '';

			sinon.stub(fsPromises, 'readFile').resolves(emptyFile);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			expect(Object.keys(jsonParsed).length).to.eq(1);
			expect(Object.keys(jsonParsed)).to.eql(['records']);
			expect(jsonParsed.errors).to.be.undefined;
			expect(jsonParsed.records.length).to.eq(0);
			expect(jsonParsed.records).to.eql([]);
		});

		it('should return empty array if file has only headers and no data', async () => {
			const onlyHeadersFile = 'study_id\tsubmitter_participant_id\tsex_at_birth\tage';

			sinon.stub(fsPromises, 'readFile').resolves(onlyHeadersFile);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			expect(Object.keys(jsonParsed).length).to.eq(1);
			expect(Object.keys(jsonParsed)).to.eql(['records']);
			expect(jsonParsed.errors).to.be.undefined;
			expect(jsonParsed.records.length).to.eq(0);
			expect(jsonParsed.records).to.eql([]);
		});

		it('should return empty array if file has only one header and no data', async () => {
			const oneHeaderFile = 'study_id';

			sinon.stub(fsPromises, 'readFile').resolves(oneHeaderFile);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			expect(Object.keys(jsonParsed).length).to.eq(1);
			expect(Object.keys(jsonParsed)).to.eql(['records']);
			expect(jsonParsed.errors).to.be.undefined;
			expect(jsonParsed.records.length).to.eq(0);
			expect(jsonParsed.records).to.eql([]);
		});

		it('should ignore columns without header title', async () => {
			const onlyHeadersFile = 'study_id\tsubmitter_participant_id\nTESTABC\tNR-01\tMale\tMan\nTESTABC';

			sinon.stub(fsPromises, 'readFile').resolves(onlyHeadersFile);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			const expectedJsonParsed = [
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-01',
				},
				{
					study_id: 'TESTABC',
					submitter_participant_id: undefined,
				},
			];

			expect(Object.keys(jsonParsed).length).to.eq(1);
			expect(Object.keys(jsonParsed)).to.eql(['records']);
			expect(jsonParsed.errors).to.be.undefined;
			expect(jsonParsed.records.length).to.eq(2);
			expect(jsonParsed.records).to.eql(expectedJsonParsed);
		});

		it('should return error parsing data with invalid value type', async () => {
			const archiveAsTsv =
				'study_id\tsubmitter_participant_id\tsex_at_birth\tage\nTESTABC\tNR-01\tMale\t21\nTESTABC\tNR-02\tFemale\tthirty';

			sinon.stub(fsPromises, 'readFile').resolves(archiveAsTsv);

			const jsonParsed = await tsvToJson('archive.tsv', schema);

			const expectedJsonParsed = [
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-01',
					sex_at_birth: 'Male',
					age: 21,
				},
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-02',
					sex_at_birth: 'Female',
					age: 'thirty',
				},
			];

			expect(Object.keys(jsonParsed).length).to.eq(2);
			expect(Object.keys(jsonParsed)).to.eql(['records', 'errors']);
			expect(jsonParsed.records.length).to.eq(2);
			expect(jsonParsed.records).to.eql(expectedJsonParsed);
			expect(jsonParsed.errors?.length).to.eq(1);
			expect(jsonParsed.errors).to.eql([
				{
					recordErrors: [
						{
							fieldName: 'age',
							fieldValue: 'thirty',
							isArray: false,
							reason: 'INVALID_VALUE_TYPE',
							valueType: 'integer',
						},
					],
					recordIndex: 1,
				},
			]);
		});
	});
});
