import { expect } from 'chai';
import { writeFileSync } from 'fs';
import { describe, it } from 'mocha';
import { join } from 'path';
import { Readable } from 'stream';
import { tmpdir } from 'os';

import { type Schema } from '@overture-stack/lectern-client';

import { submissionInsertDataFromFiles } from './submissionUtils.js';
import { type FileSchemaMap } from './types.js';

const makeFile = (path: string, originalname: string): Express.Multer.File => ({
	path,
	originalname,
	buffer: Buffer.alloc(0),
	destination: '',
	encoding: 'utf-8',
	fieldname: 'files',
	filename: '',
	mimetype: 'text/tab-separated-values',
	size: 0,
	stream: new Readable(),
});

const minimalSchema = (name: string): Schema => ({
	name,
	description: '',
	restrictions: {},
	fields: [
		{
			name: 'item_id',
			valueType: 'string',
			description: '',
			restrictions: {},
		},
	],
});

// Schema with an integer field — passing a non-numeric string causes a parse type error.
const integerSchema = (name: string): Schema => ({
	name,
	description: '',
	restrictions: {},
	fields: [
		{
			name: 'count',
			valueType: 'integer',
			description: '',
			restrictions: {},
		},
	],
});

const writeTsv = (rows: string[][]): string => {
	const path = join(tmpdir(), `lyric-test-${process.hrtime.bigint()}.tsv`);
	writeFileSync(path, rows.map((r) => r.join('\t')).join('\n'));
	return path;
};

describe('submissionInsertDataFromFiles', () => {
	it('returns status ok for a file that parses and validates successfully', async () => {
		const path = writeTsv([['item_id'], ['A']]);
		const fileSchemaMap: FileSchemaMap = {
			items: { files: [makeFile(path, 'items.tsv')], schema: minimalSchema('items') },
		};

		const { fileResults } = await submissionInsertDataFromFiles(fileSchemaMap);

		expect(fileResults).to.have.length(1);
		expect(fileResults[0]?.status).to.equal('ok');
		expect(fileResults[0]?.fileName).to.equal('items.tsv');
	});

	it('returns status invalid for a file with schema validation failures', async () => {
		const path = writeTsv([['count'], ['not-a-number']]); // non-numeric value for an integer field
		const fileSchemaMap: FileSchemaMap = {
			items: { files: [makeFile(path, 'items.tsv')], schema: integerSchema('items') },
		};

		const { fileResults } = await submissionInsertDataFromFiles(fileSchemaMap);

		expect(fileResults).to.have.length(1);
		const result = fileResults[0];
		expect(result?.status).to.equal('invalid');
		if (result?.status === 'invalid') {
			expect(result.parseErrors).to.have.length.greaterThan(0);
		}
	});

	it('returns status error for a file that cannot be read', async () => {
		const fileSchemaMap: FileSchemaMap = {
			items: { files: [makeFile('/nonexistent/path/items.tsv', 'items.tsv')], schema: minimalSchema('items') },
		};

		const { fileResults } = await submissionInsertDataFromFiles(fileSchemaMap);

		expect(fileResults).to.have.length(1);
		const result = fileResults[0];
		expect(result?.status).to.equal('error');
		if (result?.status === 'error') {
			expect(result.streamError).to.be.a('string').and.not.be.empty;
		}
	});

	it('processes remaining files when one file fails (fault isolation)', async () => {
		const validPath = writeTsv([['item_id'], ['A']]);
		const fileSchemaMap: FileSchemaMap = {
			items: {
				files: [
					makeFile('/nonexistent/path/missing.tsv', 'missing.tsv'),
					makeFile(validPath, 'valid.tsv'),
				],
				schema: minimalSchema('items'),
			},
		};

		const { fileResults } = await submissionInsertDataFromFiles(fileSchemaMap);

		expect(fileResults).to.have.length(2);
		expect(fileResults.find((r) => r.fileName === 'missing.tsv')?.status).to.equal('error');
		expect(fileResults.find((r) => r.fileName === 'valid.tsv')?.status).to.equal('ok');
	});

	it('accumulates records from multiple successful files for the same entity', async () => {
		const pathA = writeTsv([['item_id'], ['A']]);
		const pathB = writeTsv([['item_id'], ['B']]);
		const schema = minimalSchema('items');
		const fileSchemaMap: FileSchemaMap = {
			items: { files: [makeFile(pathA, 'a.tsv'), makeFile(pathB, 'b.tsv')], schema },
		};

		const { data, fileResults } = await submissionInsertDataFromFiles(fileSchemaMap);

		expect(fileResults).to.have.length(2);
		expect(fileResults.every((r) => r.status === 'ok')).to.be.true;
		expect(data['items']?.records).to.have.length(2);
	});
});
