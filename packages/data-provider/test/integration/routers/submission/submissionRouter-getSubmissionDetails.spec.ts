import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../../../../src/config/pagination.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const sportRecords = [
	{ sport_id: '1', name: 'Soccer' },
	{ sport_id: '2', name: 'Basketball' },
	{ sport_id: '3', name: 'Hockey' },
	{ sport_id: '4', name: 'Tennis' },
	{ sport_id: '5', name: 'Rugby' },
];

describe('Integration - Submission Router - GET /:submissionId/data', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let submissionId: number;

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

		const fileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport.tsv',
			entityName: 'sport',
			fileSize: 100,
		});

		// Line 1 of the file is the header, so the first data row is line 2.
		await lyricProvider.repositories.submissionRecords.saveManyForFile(
			fileId,
			sportRecords.map((data, index) => ({
				actionType: 'INSERT',
				data,
				lineNumber: index + 2,
				state: 'RECEIVED',
			})),
		);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('should return the first full page of records with pagination metadata', async () => {
		const response = await app.get(`/${submissionId}/data?page=1&pageSize=2`);

		expect(response.status).to.eq(200);
		expect(response.body.records.map((record: { data: unknown }) => record.data)).to.eql(sportRecords.slice(0, 2));
		expect(response.body.records.map((record: { lineNumber: number }) => record.lineNumber)).to.eql([2, 3]);
		expect(response.body.pagination).to.eql({
			currentPage: 1,
			pageSize: 2,
			totalPages: 3,
			totalRecords: 5,
		});
	});

	it('should return a middle page of records with pagination metadata', async () => {
		const response = await app.get(`/${submissionId}/data?page=2&pageSize=2`);

		expect(response.status).to.eq(200);
		expect(response.body.records.map((record: { data: unknown }) => record.data)).to.eql(sportRecords.slice(2, 4));
		expect(response.body.pagination).to.eql({
			currentPage: 2,
			pageSize: 2,
			totalPages: 3,
			totalRecords: 5,
		});
	});

	it('should return a partial last page of records with pagination metadata', async () => {
		const response = await app.get(`/${submissionId}/data?page=3&pageSize=2`);

		expect(response.status).to.eq(200);
		expect(response.body.records.map((record: { data: unknown }) => record.data)).to.eql(sportRecords.slice(4));
		expect(response.body.pagination).to.eql({
			currentPage: 3,
			pageSize: 2,
			totalPages: 3,
			totalRecords: 5,
		});
	});

	it('should return all records on a single page when no pagination query params are provided', async () => {
		const response = await app.get(`/${submissionId}/data`);

		expect(response.status).to.eq(200);
		expect(response.body.records.map((record: { data: unknown }) => record.data)).to.eql(sportRecords);
		expect(response.body.pagination).to.eql({
			currentPage: DEFAULT_PAGE,
			pageSize: DEFAULT_PAGE_SIZE,
			totalPages: 1,
			totalRecords: 5,
		});
	});

	it('should return every record exactly once across all pages', async () => {
		const pages = await Promise.all([1, 2, 3].map((page) => app.get(`/${submissionId}/data?page=${page}&pageSize=2`)));

		const recordIds = pages.flatMap((page) => page.body.records.map((record: { id: number }) => record.id));

		expect(recordIds).to.have.lengthOf(sportRecords.length);
		expect(new Set(recordIds).size).to.eq(sportRecords.length);
	});
});
