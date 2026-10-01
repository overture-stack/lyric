import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import type { WorkerFunctions } from '../../../../src/workers/types.js';
import { createTsvFileContent } from '../../../fixtures/createTsvContent.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../../assertions.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import { delay } from '../../utils.js';

/**
 * Waits for the submission to stop being in the 'OPEN' (validation queued) or 'VALIDATING' status, retrying up
 * to a maximum number of attempts with a delay between each attempt.
 */
const waitForSubmissionToStopValidating = async ({
	lyricProvider,
	categoryId,
	organization,
	maxRetries = 3,
	delayMs = 500,
}: {
	lyricProvider: LyricProvider;
	categoryId: number;
	organization: string;
	maxRetries?: number;
	delayMs?: number;
}) => {
	let attempt = 0;
	let submission;
	do {
		await delay(delayMs);
		submission = await lyricProvider.repositories.submission.getActiveSubmission({
			categoryId,
			username: '',
			organization,
		});
		attempt += 1;
	} while ((submission?.status === 'OPEN' || submission?.status === 'VALIDATING') && attempt < maxRetries);

	return submission;
};

/**
 * These tests check that uploaded files are processed correctly. This includes running the async submission validation
 * processor and also writing the submission records to the active submission table.
 */
describe('Integration - Submission Router - POST /category/:categoryId/files - Database persistence', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let originalCreate: typeof submissionProcessorFactory.create;
	let pendingAsyncWork: Promise<unknown> | undefined;
	let originalDataValidation: WorkerFunctions['dataValidation'];
	let pendingValidations: Promise<void>[];

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

		// Validation jobs queued by addFilesToSubmissionAsync are not awaited either; track them so each test can
		// wait for them before the database is reset
		const workerPool = lyricProvider.configs.workerPool;
		originalDataValidation = workerPool.dataValidation;
		workerPool.dataValidation = (input) => {
			const promise = originalDataValidation(input);
			pendingValidations.push(promise);
			return promise;
		};
	});

	beforeEach(async () => {
		pendingAsyncWork = undefined;
		pendingValidations = [];

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
		await pendingAsyncWork;
		await Promise.allSettled(pendingValidations);
		await getContainers().resetDatabases();
	});

	after(async () => {
		lyricProvider.configs.workerPool.dataValidation = originalDataValidation;
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.shutdown();
	});

	it('should save submitted file records to the active submission', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const submitResponse = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', sportTsv, 'sport.tsv');

		await pendingAsyncWork;

		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(
			submitResponse.body.submissionId,
		);

		expect(submissionRecords.records.length).to.eq(1);
		assertExists(submissionRecords.records[0]);
		expect(submissionRecords.records[0].entityName).to.eql('sport');
		expect(submissionRecords.records[0].actionType).to.eql('INSERT');
		expect(submissionRecords.records[0].lineNumber).to.eql(2);
		expect(submissionRecords.records[0].data).to.eql({ sport_id: '1', name: 'Soccer' });
	});

	it('should persist each record with its 1-based line number in the uploaded file', async () => {
		const sportTsv = createTsvFileContent(
			['sport_id', 'name'],
			[
				['1', 'Soccer'],
				['2', 'Basketball'],
				['3', 'Hockey'],
			],
		);

		const submitResponse = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', sportTsv, 'sport.tsv');

		await pendingAsyncWork;

		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(
			submitResponse.body.submissionId,
		);

		expect(submissionRecords.records.length).to.eq(3);
		// Line 1 is the header, so the first data row is line 2.
		expect(submissionRecords.records.map((record) => record.lineNumber)).to.eql([2, 3, 4]);
	});

	it('should save records for each entity when multiple files are submitted', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

		const submitResponse = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', sportTsv, 'sport.tsv')
			.attach('files', teamTsv, 'team.tsv');

		await pendingAsyncWork;

		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(
			submitResponse.body.submissionId,
		);

		expect(submissionRecords).to.exist;
		expect(submissionRecords.records.length).to.eq(2);
		expect(submissionRecords.records.map((record) => record.entityName)).to.eql(['sport', 'team']);
		expect(submissionRecords.records.map((record) => record.actionType)).to.eql(['INSERT', 'INSERT']);
		expect(submissionRecords.records.map((record) => record.data)).to.eql([
			{ sport_id: '1', name: 'Soccer' },
			{ team_id: '1', sport_id: '1', name: 'Team A' },
		]);
	});

	it('should merge records from multiple files for the same entity into a single batch', async () => {
		const batch1 = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const batch2 = createTsvFileContent(['sport_id', 'name'], [['2', 'Basketball']]);
		const fileEntityMap = JSON.stringify([
			{ filename: 'sports_batch1.tsv', entity: 'sport' },
			{ filename: 'sports_batch2.tsv', entity: 'sport' },
		]);

		const submitResponse = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', batch1, 'sports_batch1.tsv')
			.attach('files', batch2, 'sports_batch2.tsv')
			.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

		await pendingAsyncWork;

		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(
			submitResponse.body.submissionId,
		);

		expect(submissionRecords).to.exist;
		expect(submissionRecords.records.length).to.eq(2);
		expect(submissionRecords.records.map((record) => record.entityName)).to.eql(['sport', 'sport']);
		expect(submissionRecords.records.map((record) => record.actionType)).to.eql(['INSERT', 'INSERT']);
		expect(submissionRecords.records.map((record) => record.data)).to.eql([
			{ sport_id: '1', name: 'Soccer' },
			{ sport_id: '2', name: 'Basketball' },
		]);
	});

	it('should accumulate records across sequential submissions to the same active submission', async () => {
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

		const organization = 'testOrg';

		await app.post(`/category/${categoryId}/files?organization=${organization}`).attach('files', sportTsv, 'sport.tsv');
		await pendingAsyncWork;

		const resultFirstSubmission = await waitForSubmissionToStopValidating({
			lyricProvider,
			categoryId,
			organization,
			maxRetries: 3,
			delayMs: 500,
		});

		expect(resultFirstSubmission).to.exist;
		expect(resultFirstSubmission!.status).to.equal('VALID');

		const submitResponse = await app
			.post(`/category/${categoryId}/files?organization=${organization}`)
			.attach('files', teamTsv, 'team.tsv');
		await pendingAsyncWork;

		const resultFinalSubmission = await waitForSubmissionToStopValidating({
			lyricProvider,
			categoryId,
			organization,
			maxRetries: 3,
			delayMs: 500,
		});

		assertExists(resultFinalSubmission);
		expect(resultFinalSubmission.status).to.equal('VALID');

		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(
			submitResponse.body.submissionId,
		);

		expect(submissionRecords).to.exist;
		expect(submissionRecords.records.length).to.eq(2);
		expect(submissionRecords.records.map((record) => record.entityName)).to.eql(['sport', 'team']);
		expect(submissionRecords.records.map((record) => record.actionType)).to.eql(['INSERT', 'INSERT']);
		expect(submissionRecords.records.map((record) => record.data)).to.eql([
			{ sport_id: '1', name: 'Soccer' },
			{ team_id: '1', sport_id: '1', name: 'Team A' },
		]);
	});
});
