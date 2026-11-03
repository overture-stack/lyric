import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Schema } from '@overture-stack/lectern-client';

import type { SubmissionRecordWithEntityName } from '../../../src/repository/submissionRecordsRepository.js';
import {
	buildSubmissionFileData,
	formatSeparatedValue,
	formatSubmissionFileContent,
	getDownloadFileName,
} from '../../../src/utils/submissionFileDownload.js';

const sportSchema: Schema = {
	name: 'sport',
	fields: [
		{ name: 'sport_id', valueType: 'string' },
		{ name: 'name', valueType: 'string' },
		{ name: 'tags', valueType: 'string', isArray: true, delimiter: '|' },
	],
};

const createRecord = (
	record: Pick<SubmissionRecordWithEntityName, 'id' | 'actionType' | 'data' | 'lineNumber'>,
): SubmissionRecordWithEntityName => ({
	appliedByChildren: false,
	entityName: 'sport',
	errors: null,
	fileId: 1,
	parentRecordId: null,
	state: 'RECEIVED',
	...record,
});

describe('Submission File Download Utils', () => {
	describe('getDownloadFileName', () => {
		const fileData = { submissionId: 12, actionType: 'update', entityName: 'sport', fileId: 34 };

		it('should name the file after its submission, action type, entity, and file ID', () => {
			expect(getDownloadFileName(fileData, 'csv')).to.eq('12-update-sport-file-34.csv');
		});
		it('should use the extension of the file type', () => {
			expect(getDownloadFileName(fileData, 'tsv')).to.eq('12-update-sport-file-34.tsv');
		});
	});

	describe('formatSeparatedValue', () => {
		it('should leave a plain value as is', () => {
			expect(formatSeparatedValue('Soccer', ',')).to.eq('Soccer');
		});
		it('should quote a value containing the separator', () => {
			expect(formatSeparatedValue('a,b', ',')).to.eq('"a,b"');
		});
		it('should not quote a value containing another file type separator', () => {
			expect(formatSeparatedValue('a,b', '\t')).to.eq('a,b');
		});
		it('should quote a value containing a line break, and escape its double quotes', () => {
			expect(formatSeparatedValue('say "hi"\nthere', '\t')).to.eq('"say ""hi""\nthere"');
		});
	});

	describe('buildSubmissionFileData', () => {
		it('should use the schema fields as headers, and order INSERT records by line number', () => {
			const records = [
				createRecord({ id: 1, actionType: 'INSERT', data: { sport_id: '2', name: 'Hockey' }, lineNumber: 3 }),
				createRecord({ id: 2, actionType: 'INSERT', data: { sport_id: '1', name: 'Soccer' }, lineNumber: 2 }),
			];

			const result = buildSubmissionFileData({ schema: sportSchema, records, submittedDataBySystemId: new Map() });

			expect(result).to.eql({
				actionType: 'insert',
				headers: ['sport_id', 'name', 'tags'],
				rows: [
					['1', 'Soccer', ''],
					['2', 'Hockey', ''],
				],
			});
		});

		it('should place records without a line number last, in the order they were added', () => {
			const records = [
				createRecord({ id: 3, actionType: 'INSERT', data: { sport_id: '3' }, lineNumber: null }),
				createRecord({ id: 2, actionType: 'INSERT', data: { sport_id: '2' }, lineNumber: null }),
				createRecord({ id: 1, actionType: 'INSERT', data: { sport_id: '1' }, lineNumber: 2 }),
			];

			const { rows } = buildSubmissionFileData({ schema: sportSchema, records, submittedDataBySystemId: new Map() });

			expect(rows.map((row) => row[0])).to.eql(['1', '2', '3']);
		});

		it('should convert values to text, joining arrays with the field delimiter', () => {
			const records = [
				createRecord({
					id: 1,
					actionType: 'INSERT',
					data: { sport_id: 1, name: true, tags: ['team', 'ball'] },
					lineNumber: 2,
				}),
			];

			const { rows } = buildSubmissionFileData({ schema: sportSchema, records, submittedDataBySystemId: new Map() });

			expect(rows).to.eql([['1', 'true', 'team|ball']]);
		});

		it('should add a systemId column, applying UPDATE values over the current Submitted Data', () => {
			const records = [
				createRecord({
					id: 1,
					actionType: 'UPDATE',
					data: { systemId: 'SYS1', old: { name: 'Football' }, new: { name: 'Soccer' } },
					lineNumber: 2,
				}),
				createRecord({
					id: 2,
					actionType: 'DELETE',
					data: { systemId: 'SYS2', data: { sport_id: '2', name: 'Hockey' }, isValid: true, organization: 'org' },
					lineNumber: 3,
				}),
				createRecord({ id: 3, actionType: 'INSERT', data: { sport_id: '3', name: 'Tennis' }, lineNumber: 4 }),
			];

			const result = buildSubmissionFileData({
				schema: sportSchema,
				records,
				submittedDataBySystemId: new Map([['SYS1', { sport_id: '1', name: 'Football', tags: ['ball'] }]]),
			});

			expect(result).to.eql({
				actionType: 'update_delete_insert',
				headers: ['sport_id', 'name', 'tags', 'systemId'],
				rows: [
					['1', 'Soccer', 'ball', 'SYS1'],
					['2', 'Hockey', '', 'SYS2'],
					['3', 'Tennis', '', ''],
				],
			});
		});

		it('should only use the UPDATE values when the Submitted Data is not found', () => {
			const records = [
				createRecord({
					id: 1,
					actionType: 'UPDATE',
					data: { systemId: 'SYS1', old: { name: 'Football' }, new: { name: 'Soccer' } },
					lineNumber: 2,
				}),
			];

			const { rows } = buildSubmissionFileData({ schema: sportSchema, records, submittedDataBySystemId: new Map() });

			expect(rows).to.eql([['', 'Soccer', '', 'SYS1']]);
		});

		it('should return no rows, and an empty action type, when the file has no records', () => {
			const result = buildSubmissionFileData({ schema: sportSchema, records: [], submittedDataBySystemId: new Map() });

			expect(result).to.eql({ actionType: 'empty', headers: ['sport_id', 'name', 'tags'], rows: [] });
		});
	});

	describe('formatSubmissionFileContent', () => {
		const fileData = {
			headers: ['sport_id', 'name'],
			rows: [
				['1', 'Soccer, association'],
				['2', 'Hockey'],
			],
		};

		it('should format a .csv file with the headers on the first line', () => {
			expect(formatSubmissionFileContent(fileData, 'csv')).to.eq('sport_id,name\n1,"Soccer, association"\n2,Hockey\n');
		});

		it('should format a .tsv file with the headers on the first line', () => {
			expect(formatSubmissionFileContent(fileData, 'tsv')).to.eq('sport_id\tname\n1\tSoccer, association\n2\tHockey\n');
		});

		it('should write only the headers when there are no rows', () => {
			expect(formatSubmissionFileContent({ headers: ['sport_id', 'name'], rows: [] }, 'csv')).to.eq('sport_id,name\n');
		});
	});
});
