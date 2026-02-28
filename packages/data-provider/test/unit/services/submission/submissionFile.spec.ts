import assert from 'node:assert';
import { Readable } from 'stream';

import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	getSubmittedFileEntity,
	getSubmittedFileType,
	SUBMITTED_FILE_ERROR_CODES,
} from '../../../../src/services/submission/submissionFile.js';
import type { FilenameEntityPair } from '../../../../src/utils/schemas.js';
import { dictionarySportsData } from '../../utils/fixtures/dictionarySchemasTestData.js';

function createFile(params: { filename?: string; originalname?: string }): Express.Multer.File {
	return {
		originalname: params.originalname ?? '',
		filename: params.filename ?? '',

		buffer: Buffer.alloc(0),
		destination: '',
		encoding: '',
		fieldname: '',
		mimetype: '',
		path: '',
		size: 0,
		stream: new Readable(),
	};
}

const schemas = dictionarySportsData;
const sportSchema = dictionarySportsData.find((schema) => schema.name === 'sport')!;

describe('Submission File - getSubmittedFileType', () => {
	it('should return success with "csv" for a .csv file', () => {
		const file = createFile({ filename: 'sport.csv' });
		const result = getSubmittedFileType(file);
		assert(result.success, 'Expected file type resolution to succeed for a .csv file');
		expect(result.data).to.equal('csv');
	});

	it('should return success with "tsv" for a .tsv file', () => {
		const file = createFile({ filename: 'sport.tsv' });
		const result = getSubmittedFileType(file);
		assert(result.success, 'Expected file type resolution to succeed for a .tsv file');
		expect(result.data).to.equal('tsv');
	});

	it('should match extension case-insensitively', () => {
		const file = createFile({ filename: 'sport.CSV' });
		const result = getSubmittedFileType(file);
		assert(result.success, 'Expected file type resolution to succeed for an uppercase extension');
		expect(result.data).to.equal('csv');
	});

	it('should return failure for an unsupported extension', () => {
		const file = createFile({ filename: 'sport.xlsx' });
		const result = getSubmittedFileType(file);
		assert(!result.success, 'Expected file type resolution to fail for an unsupported extension');
		expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNSUPPORTED_FILETYPE);
	});

	it('should return failure when the file has no extension', () => {
		const file = createFile({ filename: 'sport' });
		const result = getSubmittedFileType(file);
		assert(!result.success, 'Expected file type resolution to fail when the file has no extension');
		expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNSUPPORTED_FILETYPE);
	});
});

describe('Submission File - getSubmittedFileEntity', () => {
	describe('without a fileEntityMap', () => {
		it('should match a file to a schema by its originalname', () => {
			const file = createFile({ originalname: 'sport.csv' });
			const result = getSubmittedFileEntity({ file, schemas });
			assert(result.success, 'Expected entity resolution to succeed when the filename matches a schema name');
			expect(result.data).to.deep.equal(sportSchema);
		});

		it('should match case-insensitively against the schema name', () => {
			const file = createFile({ originalname: 'SPORT.csv' });
			const result = getSubmittedFileEntity({ file, schemas });
			assert(result.success, 'Expected entity resolution to succeed with a case-mismatched filename');
			expect(result.data).to.deep.equal(sportSchema);
		});

		it('should return UNKNOWN_ENTITY failure when the filename does not match any schema', () => {
			const file = createFile({ originalname: 'unknown.csv' });
			const result = getSubmittedFileEntity({ file, schemas });
			assert(!result.success, 'Expected entity resolution to fail when the filename matches no schema');
			expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY);
		});
	});

	describe('with a fileEntityMap', () => {
		it('should resolve a file to a schema using the map when the filename matches an entry', () => {
			const file = createFile({ originalname: 'custom_data.csv' });
			const fileEntityMap: FilenameEntityPair[] = [{ filename: 'custom_data.csv', entity: 'sport' }];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(result.success, 'Expected entity resolution to succeed when the file matches a map entry');
			expect(result.data).to.deep.equal(sportSchema);
		});

		it('should resolve correctly when multiple map entries share the same filename and entity', () => {
			const file = createFile({ originalname: 'custom_data.csv' });
			const fileEntityMap: FilenameEntityPair[] = [
				{ filename: 'custom_data.csv', entity: 'sport' },
				{ filename: 'custom_data.csv', entity: 'sport' },
			];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(result.success, 'Expected entity resolution to succeed when duplicate map entries point to the same entity');
			expect(result.data).to.deep.equal(sportSchema);
		});

		it('should return UNKNOWN_ENTITY failure when multiple map entries for the filename point to different entities', () => {
			const file = createFile({ originalname: 'custom_data.csv' });
			const fileEntityMap: FilenameEntityPair[] = [
				{ filename: 'custom_data.csv', entity: 'sport' },
				{ filename: 'custom_data.csv', entity: 'team' },
			];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(!result.success, 'Expected entity resolution to fail when conflicting map entries exist for the same filename');
			expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY);
		});

		it('should return UNKNOWN_ENTITY failure when the map entry points to an entity with no matching schema', () => {
			const file = createFile({ originalname: 'custom_data.csv' });
			const fileEntityMap: FilenameEntityPair[] = [{ filename: 'custom_data.csv', entity: 'nonexistent' }];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(!result.success, 'Expected entity resolution to fail when the mapped entity name does not match any schema');
			expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY);
		});

		it('should fall back to filename matching when the file is not in the map', () => {
			const file = createFile({ originalname: 'sport.csv' });
			const fileEntityMap: FilenameEntityPair[] = [{ filename: 'other_file.csv', entity: 'team' }];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(result.success, 'Expected entity resolution to succeed via filename fallback when the file is absent from the map');
			expect(result.data).to.deep.equal(sportSchema);
		});

		it('should return UNKNOWN_ENTITY failure when not in the map and filename does not match any schema', () => {
			const file = createFile({ originalname: 'unknown.csv' });
			const fileEntityMap: FilenameEntityPair[] = [{ filename: 'other_file.csv', entity: 'team' }];
			const result = getSubmittedFileEntity({ file, schemas, fileEntityMap });
			assert(!result.success, 'Expected entity resolution to fail when the file is absent from the map and the filename matches no schema');
			expect(result.data.code).to.equal(SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY);
		});
	});
});
