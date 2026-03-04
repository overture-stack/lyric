import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { dictionarySportsData } from '../../../unit/utils/fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { createTsvFileContent } from '../../fixtures/createTsvContent.js';
import { getContainers } from '../../globalSetup.js';

/**
 * These tests check that uploaded files are processed correctly. This includes running the async submission validation
 * processor and also writing the submission records to the active submission table.
 */
describe('Integration - Submission Router - POST /category/:categoryId/files - Database persistence', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let originalCreate: typeof submissionProcessorFactory.create;
	let pendingAsyncWork: Promise<void> | undefined;

	before(async () => {
		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);

			// The addFilesToSubmission function does the work for the submitFiles service, but is not normally awaited
			// since we want to fire-and-forget so we don't hold up the response to the client.
			// We overwrite the default function so we can grab its promise so we can await its completion and check its work
			const originalAddFiles = processor.addFilesToSubmissionAsync;
			processor.addFilesToSubmissionAsync = (...args) => {
				const promise = originalAddFiles(...args);
				pendingAsyncWork = promise;
				return promise;
			};
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		pendingAsyncWork = undefined;

		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});

		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});

		categoryId = category.id;
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.disconnect();
	});

	it('should save submitted file records to the active submission', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

		await app.post(`/category/${categoryId}/files?organization=testOrg`).attach('files', sportTsv, 'sport.tsv');

		await pendingAsyncWork;

		const submission = await lyricProvider.repositories.submission.getActiveSubmissionDetails({
			categoryId,
			username: '',
			organization: 'testOrg',
		});

		expect(submission).to.exist;
		expect(submission!.data.inserts).to.have.property('sport');
		expect(submission!.data.inserts!['sport'].records).to.have.length(1);
		expect(submission!.data.inserts!['sport'].records[0]).to.include({ sport_id: '1', name: 'Soccer' });
	});

	it('should save records for each entity when multiple files are submitted', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

		await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', sportTsv, 'sport.tsv')
			.attach('files', teamTsv, 'team.tsv');

		await pendingAsyncWork;

		const submission = await lyricProvider.repositories.submission.getActiveSubmissionDetails({
			categoryId,
			username: '',
			organization: 'testOrg',
		});

		expect(submission).to.exist;
		expect(submission!.data.inserts).to.have.property('sport');
		expect(submission!.data.inserts!['sport'].records).to.have.length(1);
		expect(submission!.data.inserts!['sport'].records[0]).to.include({ sport_id: '1', name: 'Soccer' });
		expect(submission!.data.inserts).to.have.property('team');
		expect(submission!.data.inserts!['team'].records).to.have.length(1);
		expect(submission!.data.inserts!['team'].records[0]).to.include({ team_id: '1', sport_id: '1', name: 'Team A' });
	});

	it('should merge records from multiple files for the same entity into a single batch', async () => {
		const batch1 = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const batch2 = createTsvFileContent(['sport_id', 'name'], [['2', 'Basketball']]);
		const fileEntityMap = JSON.stringify([
			{ filename: 'sports_batch1.tsv', entity: 'sport' },
			{ filename: 'sports_batch2.tsv', entity: 'sport' },
		]);

		await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', batch1, 'sports_batch1.tsv')
			.attach('files', batch2, 'sports_batch2.tsv')
			.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

		await pendingAsyncWork;

		const submission = await lyricProvider.repositories.submission.getActiveSubmissionDetails({
			categoryId,
			username: '',
			organization: 'testOrg',
		});

		expect(submission).to.exist;
		expect(submission!.data.inserts).to.have.property('sport');
		expect(submission!.data.inserts!['sport'].records).to.have.length(2);
	});

	it('should accumulate records across sequential submissions to the same active submission', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

		await app.post(`/category/${categoryId}/files?organization=testOrg`).attach('files', sportTsv, 'sport.tsv');
		await pendingAsyncWork;

		await app.post(`/category/${categoryId}/files?organization=testOrg`).attach('files', teamTsv, 'team.tsv');
		await pendingAsyncWork;

		const submission = await lyricProvider.repositories.submission.getActiveSubmissionDetails({
			categoryId,
			username: '',
			organization: 'testOrg',
		});

		expect(submission).to.exist;
		expect(submission!.data.inserts).to.have.property('sport');
		expect(submission!.data.inserts!['sport'].records).to.have.length(1);
		expect(submission!.data.inserts).to.have.property('team');
		expect(submission!.data.inserts!['team'].records).to.have.length(1);
	});
});
