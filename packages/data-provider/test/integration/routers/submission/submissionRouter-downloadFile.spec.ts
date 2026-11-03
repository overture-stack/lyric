import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

describe('Integration - Submission Router - GET /:submissionId/download', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let submissionId: number;
	let insertFileId: number;
	let editFileId: number;

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
			status: 'OPEN',
		});

		await lyricProvider.repositories.submittedData.save({
			data: { sport_id: '10', name: 'Football', description: 'Played with the feet' },
			dictionaryCategoryId: category.id,
			entityName: 'sport',
			isValid: true,
			lastValidSchemaId: dictionary.id,
			organization: 'testOrg',
			originalSchemaId: dictionary.id,
			systemId: 'SPORT-10',
			createdBy: 'test',
			updatedBy: 'test',
		});

		insertFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport.tsv',
			entityName: 'sport',
			fileSize: 100,
		});

		// Saved out of line order, so the download must sort them
		await lyricProvider.repositories.submissionRecords.saveManyForFile(insertFileId, [
			{ actionType: 'INSERT', data: { sport_id: '2', name: 'Basketball' }, lineNumber: 3, state: 'RECEIVED' },
			{ actionType: 'INSERT', data: { sport_id: '1', name: 'Soccer' }, lineNumber: 2, state: 'RECEIVED' },
		]);

		editFileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport-edits.csv',
			entityName: 'sport',
			fileSize: 100,
		});

		await lyricProvider.repositories.submissionRecords.saveManyForFile(editFileId, [
			{
				actionType: 'UPDATE',
				data: { systemId: 'SPORT-10', old: { name: 'Football' }, new: { name: 'Soccer, association' } },
				lineNumber: 2,
				state: 'RECEIVED',
			},
		]);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('should download a .csv file by default, with headers first and rows by line number', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=${insertFileId}`);

		expect(response.status).to.eq(200);
		expect(response.headers['content-type']).to.match(/^text\/csv/);
		expect(response.headers['content-disposition']).to.eq(
			`attachment; filename="${submissionId}-insert-sport-file-${insertFileId}.csv"`,
		);
		expect(response.text).to.eq('sport_id,name,description\n1,Soccer,\n2,Basketball,\n');
	});

	it('should download a .tsv file when fileType is tsv', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=${insertFileId}&fileType=tsv`);

		expect(response.status).to.eq(200);
		expect(response.headers['content-type']).to.match(/^text\/tab-separated-values/);
		expect(response.headers['content-disposition']).to.eq(
			`attachment; filename="${submissionId}-insert-sport-file-${insertFileId}.tsv"`,
		);
		expect(response.text).to.eq('sport_id\tname\tdescription\n1\tSoccer\t\n2\tBasketball\t\n');
	});

	it('should add a systemId column for UPDATE records, with unchanged values from the Submitted Data', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=${editFileId}&fileType=csv`);

		expect(response.status).to.eq(200);
		expect(response.headers['content-disposition']).to.eq(
			`attachment; filename="${submissionId}-update-sport-file-${editFileId}.csv"`,
		);
		expect(response.text).to.eq(
			'sport_id,name,description,systemId\n10,"Soccer, association",Played with the feet,SPORT-10\n',
		);
	});

	it('should return 400 when fileType is not csv or tsv', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=${insertFileId}&fileType=json`);

		expect(response.status).to.eq(400);
	});

	it('should return 400 when fileId is missing', async () => {
		const response = await app.get(`/${submissionId}/download`);

		expect(response.status).to.eq(400);
	});

	it('should return 400 when fileId is not a positive integer', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=abc`);

		expect(response.status).to.eq(400);
	});

	it('should return 400 when the submission does not exist', async () => {
		const response = await app.get(`/${submissionId + 1000}/download?fileId=${insertFileId}`);

		expect(response.status).to.eq(400);
		expect(response.body.message).to.eq(`Submission '${submissionId + 1000}' not found`);
	});

	it('should return 400 when the file does not belong to the submission', async () => {
		const response = await app.get(`/${submissionId}/download?fileId=${editFileId + 1000}`);

		expect(response.status).to.eq(400);
		expect(response.body.message).to.eq(
			`File with ID '${editFileId + 1000}' not found in Submission '${submissionId}'`,
		);
	});
});
