import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

describe('Integration - Submission Router - GET /:submissionId/errors', () => {
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
				errors: [{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'name', fieldValue: 'not-a-real-sport' }],
			},
			{
				data: { sport_id: '2', name: 'Soccer' },
				actionType: 'INSERT',
				state: 'VALID',
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

	it('returns the normalized field errors for the file, omitting valid records', async () => {
		const response = await app.get(`/${submissionId}/errors`).query({ fileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal([
			{
				fieldName: 'name',
				fieldValue: 'not-a-real-sport',
				reason: 'UNRECOGNIZED_FIELD',
				message: `Field 'name' is not recognized in the schema`,
			},
		]);
	});

	it('returns an empty array when the file has no errors', async () => {
		const cleanFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'clean.tsv',
			entityName: 'sport',
			fileSize: 50,
		});
		await lyricProvider.repositories.submissionRecords.saveManyForFile(cleanFileId, [
			{ data: { sport_id: '3', name: 'Hockey' }, actionType: 'INSERT', state: 'VALID', errors: null },
		]);

		const response = await app.get(`/${submissionId}/errors`).query({ fileId: cleanFileId });

		expect(response.status).to.eq(200);
		expect(response.body).to.deep.equal([]);
	});

	it('returns 400 when fileId is missing', async () => {
		const response = await app.get(`/${submissionId}/errors`);

		expect(response.status).to.eq(400);
	});

	it('returns 404 when the file does not belong to the submission', async () => {
		const response = await app.get(`/${submissionId}/errors`).query({ fileId: fileId + 999 });

		expect(response.status).to.eq(404);
	});
});
