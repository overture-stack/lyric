import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

describe('Integration - Submission Router - GET /:submissionId/errors/summary', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let submissionId: number;
	let fileId: number;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});

		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});

		submissionId = await lyricProvider.repositories.submission.save({
			dictionaryCategoryId: category.id,
			dictionaryId: dictionary.id,
			organization: 'testOrg',
			status: 'INVALID',
			createdBy: 'testUser',
		});

		fileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport.tsv',
			entityName: 'sport',
			fileSize: 100,
		});

		await lyricProvider.repositories.submissionRecords.saveManyForFile(fileId, [
			{
				data: { sport_id: '1', name: 'not-a-real-sport' },
				actionType: 'INSERT',
				state: 'INVALID',
				lineNumber: 2,
				errors: [{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'name', fieldValue: 'not-a-real-sport' }],
			},
			{
				data: { sport_id: '4', name: 'also-not-real' },
				actionType: 'INSERT',
				state: 'INVALID',
				lineNumber: 3,
				errors: [{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'name', fieldValue: 'also-not-real' }],
			},
			{
				data: { sport_id: '2', name: 'Soccer' },
				actionType: 'INSERT',
				state: 'VALID',
				lineNumber: 4,
				errors: null,
			},
		]);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('returns recordsWithErrors and counts grouped by fieldName and reason, with the contributing rowNumbers', async () => {
		const response = await app.get(`/${submissionId}/errors/summary`).query({ fileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal({
			recordsWithErrors: 2,
			errorsByFieldAndReason: [
				{
					fieldName: 'name',
					reason: 'UNRECOGNIZED_FIELD',
					message: `Field 'name' is not recognized in the schema`,
					count: 2,
					rowNumbers: [2, 3],
				},
			],
		});
	});

	it('counts a record with no line number toward count, without adding it to rowNumbers', async () => {
		const noLineNumberFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'edited.tsv',
			entityName: 'sport',
			fileSize: 50,
		});
		await lyricProvider.repositories.submissionRecords.saveManyForFile(noLineNumberFileId, [
			{
				data: { sport_id: '9', name: 'not-a-real-sport' },
				actionType: 'INSERT',
				state: 'INVALID',
				errors: [{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'name', fieldValue: 'not-a-real-sport' }],
			},
		]);

		const response = await app.get(`/${submissionId}/errors/summary`).query({ fileId: noLineNumberFileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal({
			recordsWithErrors: 1,
			errorsByFieldAndReason: [
				{
					fieldName: 'name',
					reason: 'UNRECOGNIZED_FIELD',
					message: `Field 'name' is not recognized in the schema`,
					count: 1,
					rowNumbers: [],
				},
			],
		});
	});

	it('returns zero recordsWithErrors and an empty breakdown for a file with no errors', async () => {
		const cleanFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'clean.tsv',
			entityName: 'sport',
			fileSize: 50,
		});
		await lyricProvider.repositories.submissionRecords.saveManyForFile(cleanFileId, [
			{ data: { sport_id: '3', name: 'Hockey' }, actionType: 'INSERT', state: 'VALID', errors: null },
		]);

		const response = await app.get(`/${submissionId}/errors/summary`).query({ fileId: cleanFileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal({ recordsWithErrors: 0, errorsByFieldAndReason: [] });
	});

	it('returns 404 when the file does not belong to the submission', async () => {
		const response = await app.get(`/${submissionId}/errors/summary`).query({ fileId: fileId + 999 });

		expect(response.status).to.eq(404);
	});

	it('returns 400 when fileId is missing', async () => {
		const response = await app.get(`/${submissionId}/errors/summary`);

		expect(response.status).to.eq(400);
	});

	it('splits INVALID_BY_RESTRICTION errors on the same field into separate groups by restrictionType', async () => {
		const restrictionFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'restrictions.tsv',
			entityName: 'sport',
			fileSize: 100,
		});

		await lyricProvider.repositories.submissionRecords.saveManyForFile(restrictionFileId, [
			{
				data: { sport_id: '5', name: 'Rugby' },
				actionType: 'INSERT',
				state: 'INVALID',
				lineNumber: 2,
				errors: [
					{
						reason: 'INVALID_BY_RESTRICTION',
						fieldName: 'sport_id',
						fieldValue: '5',
						errors: [{ message: 'A value is required for this field.', restriction: { type: 'required', rule: true } }],
					},
				],
			},
			{
				data: { sport_id: '999', name: 'Cricket' },
				actionType: 'INSERT',
				state: 'INVALID',
				lineNumber: 3,
				errors: [
					{
						reason: 'INVALID_BY_RESTRICTION',
						fieldName: 'sport_id',
						fieldValue: '999',
						errors: [
							{
								message: 'The value must be within the range.',
								restriction: { type: 'range', rule: { min: 0, max: 10 } },
							},
						],
					},
				],
			},
		]);

		const response = await app.get(`/${submissionId}/errors/summary`).query({ fileId: restrictionFileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal({
			recordsWithErrors: 2,
			errorsByFieldAndReason: [
				{
					fieldName: 'sport_id',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'required',
					message: 'A value is required for this field.',
					count: 1,
					rowNumbers: [2],
				},
				{
					fieldName: 'sport_id',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'range',
					message: 'The value must be within the range.',
					count: 1,
					rowNumbers: [3],
				},
			],
		});
	});
});

describe('Integration - Submission Router - GET /:submissionId/errors/download', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let submissionId: number;
	let fileId: number;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});

		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});

		submissionId = await lyricProvider.repositories.submission.save({
			dictionaryCategoryId: category.id,
			dictionaryId: dictionary.id,
			organization: 'testOrg',
			status: 'INVALID',
			createdBy: 'testUser',
		});

		fileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport.tsv',
			entityName: 'sport',
			fileSize: 100,
		});

		await lyricProvider.repositories.submissionRecords.saveManyForFile(fileId, [
			{
				data: { sport_id: '1', name: 'not-a-real-sport' },
				actionType: 'INSERT',
				state: 'INVALID',
				lineNumber: 2,
				errors: [{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'name', fieldValue: 'not-a-real-sport' }],
			},
		]);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('downloads errors as CSV by default, with attachment headers and a leading rowNumber column', async () => {
		const response = await app.get(`/${submissionId}/errors/download`).query({ fileId });

		expect(response.status).to.eq(200);
		expect(response.headers['content-type']).to.include('text/csv');
		expect(response.headers['content-disposition']).to.eq(
			`attachment; filename=submission_${submissionId}_file_${fileId}_errors.csv`,
		);
		expect(response.text).to.eq(
			"rowNumber,fieldName,reason,fieldValue,message\n2,name,UNRECOGNIZED_FIELD,not-a-real-sport,Field 'name' is not recognized in the schema\n",
		);
	});

	it('downloads errors as TSV when fileType=tsv', async () => {
		const response = await app.get(`/${submissionId}/errors/download`).query({ fileId, fileType: 'tsv' });

		expect(response.status).to.eq(200);
		expect(response.headers['content-type']).to.include('text/tab-separated-values');
		expect(response.headers['content-disposition']).to.eq(
			`attachment; filename=submission_${submissionId}_file_${fileId}_errors.tsv`,
		);
		expect(response.text).to.eq(
			"rowNumber\tfieldName\treason\tfieldValue\tmessage\n2\tname\tUNRECOGNIZED_FIELD\tnot-a-real-sport\tField 'name' is not recognized in the schema\n",
		);
	});

	it('returns 404 when the file does not belong to the submission', async () => {
		const response = await app.get(`/${submissionId}/errors/download`).query({ fileId: fileId + 999 });

		expect(response.status).to.eq(404);
	});

	it('returns 400 when fileId is missing', async () => {
		const response = await app.get(`/${submissionId}/errors/download`);

		expect(response.status).to.eq(400);
	});
});
