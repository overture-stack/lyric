import { expect } from 'chai';
import fs from 'fs';
import { describe, it } from 'mocha';
import sinon from 'sinon';

const fsPromises = fs.promises;

import { tsvToJson } from '../../src/utils/fileUtils.js';

describe('File Utils', () => {
	beforeEach(() => {
		sinon.restore();
	});

	describe('Convert any text file into a json', () => {
		it('should read a .tsv file and parse it to JSON format', async () => {
			const archiveAsTsv =
				'study_id\tsubmitter_participant_id\tsex_at_birth\tgender\nTESTABC\tNR-01\tMale\tMan\nTESTABC\tNR-02\tFemale\tWoman';

			sinon.stub(fsPromises, 'readFile').resolves(archiveAsTsv);

			const jsonParsed = await tsvToJson('archive.tsv');

			const expectedJsonParsed = [
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-01',
					sex_at_birth: 'Male',
					gender: 'Man',
				},
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-02',
					sex_at_birth: 'Female',
					gender: 'Woman',
				},
			];

			expect(jsonParsed).to.eql(expectedJsonParsed);
		});

		it('should convert a .csv into json', async () => {
			const csvFile =
				'study_id,submitter_participant_id,sex_at_birth,gender\nTESTABC,NR-01,Male,Man\nTESTABC,NR-02,Female,Woman';

			sinon.stub(fsPromises, 'readFile').resolves(csvFile);

			const jsonParsed = await tsvToJson('archive.tsv');

			const expectedJsonParsed = [
				{
					'study_id,submitter_participant_id,sex_at_birth,gender': 'TESTABC,NR-01,Male,Man',
				},
				{
					'study_id,submitter_participant_id,sex_at_birth,gender': 'TESTABC,NR-02,Female,Woman',
				},
			];

			expect(jsonParsed).to.be.eql(expectedJsonParsed);
		});

		it('should return empty array if file has no content', async () => {
			const emptyFile = '';

			sinon.stub(fsPromises, 'readFile').resolves(emptyFile);

			const jsonParsed = await tsvToJson('archive.tsv');

			expect(jsonParsed).to.be.eql([]);
		});

		it('should return empty array if file has only headers and no data', async () => {
			const onlyHeadersFile = 'study_id\tsubmitter_participant_id\tsex_at_birth\tgender';

			sinon.stub(fsPromises, 'readFile').resolves(onlyHeadersFile);

			const jsonParsed = await tsvToJson('archive.tsv');

			expect(jsonParsed).to.be.eql([]);
		});

		it('should return empty array if file has only one header and no data', async () => {
			const oneHeaderFile = 'study_id';

			sinon.stub(fsPromises, 'readFile').resolves(oneHeaderFile);

			const jsonParsed = await tsvToJson('archive.tsv');

			expect(jsonParsed).to.be.eql([]);
		});

		it('should ignore columns without header title', async () => {
			const onlyHeadersFile = 'study_id\tsubmitter_participant_id\nTESTABC\tNR-01\tMale\tMan\nTESTABC';

			sinon.stub(fsPromises, 'readFile').resolves(onlyHeadersFile);

			const jsonParsed = await tsvToJson('archive.tsv');

			const expectedJsonParsed = [
				{
					study_id: 'TESTABC',
					submitter_participant_id: 'NR-01',
				},
				{
					study_id: 'TESTABC',
					submitter_participant_id: '',
				},
			];

			expect(jsonParsed).to.be.eql(expectedJsonParsed);
		});
	});
});
