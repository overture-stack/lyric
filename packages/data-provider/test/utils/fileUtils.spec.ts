import { expect } from 'chai';
import fs from 'fs';
import { describe, it } from 'mocha';
import sinon from 'sinon';

const fsPromises = fs.promises;

import { tsvToJson } from '../../src/utils/fileUtils.js';

describe('File Utils', () => {
	it('should read a .tsv file and parse it to JSON format', async () => {
		const archiveAsTsv = 'study_id\tsubmitter_participant_id\tsex_at_birth\tgender\nTESTABC\tNR-01\tMale\tMan';

		sinon.stub(fsPromises, 'readFile').resolves(archiveAsTsv);

		const jsonParsed = await tsvToJson('archive.tsv');

		const expectedJsonParsed = [
			{
				study_id: 'TESTABC',
				submitter_participant_id: 'NR-01',
				sex_at_birth: 'Male',
				gender: 'Man',
			},
		];

		expect(jsonParsed).to.eql(expectedJsonParsed);
	});
});
