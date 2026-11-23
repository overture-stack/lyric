import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { DataRecord } from '@overture-stack/lectern-client';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { ACTIVE_SUBMISSION_STATUS, SUBMISSION_STATUS } from '../../../../src/utils/types.js';
import type { WorkerFunctions } from '../../../../src/workers/types.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const ORGANIZATION = 'testOrg';
const OTHER_ORGANIZATION = 'otherOrg';

/**
 * These tests check that an edit of Submitted Data is only staged when every record identifies one Submitted Data
 * record that has no other change staged:
 * - an edit with an unknown System ID, a System ID of another entity or organization, a record without a System ID,
 *   or a System ID sent twice, is rejected without staging anything
 * - an edit of a System ID that already has an UPDATE or a DELETE staged is rejected without staging anything
 * - validation marks every UPDATE of a System ID with more than one UPDATE staged as INVALID
 *
 * Validation jobs only run when a test enables them, so the records left by staging can be inspected.
 */
describe('Integration - Submission Router - Editing Submitted Data', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let workerPool: WorkerFunctions;
	let categoryId: number;
	let dictionaryId: number;
	let submissionId: number;

	let originalCreate: typeof submissionProcessorFactory.create;
	let originalDataValidation: WorkerFunctions['dataValidation'];
	let pendingWork: Promise<unknown>[];

	// When false, validation jobs are not run, so the records left by staging can be inspected
	let runValidationJobs: boolean;

	const trackPendingWork = <Result>(promise: Promise<Result>): Promise<Result> => {
		pendingWork.push(promise);
		return promise;
	};

	const waitForPendingWork = async (): Promise<void> => {
		while (pendingWork.length > 0) {
			await Promise.allSettled(pendingWork.splice(0));
		}
	};

	const saveSubmittedData = ({
		data,
		entityName,
		organization = ORGANIZATION,
		systemId,
	}: {
		data: DataRecord;
		entityName: string;
		organization?: string;
		systemId: string;
	}) =>
		lyricProvider.repositories.submittedData.save({
			data,
			dictionaryCategoryId: categoryId,
			entityName,
			isValid: true,
			organization,
			originalSchemaId: dictionaryId,
			systemId,
		});

	const getRecords = async () =>
		(await lyricProvider.repositories.submissionRecords.getBySubmissionId(submissionId)).records;

	const editSports = async (records: Record<string, unknown>[]) => {
		const response = await app
			.put(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
			.send(records);
		await waitForPendingWork();
		return response;
	};

	before(async () => {
		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);
			// Edits are staged in the background; track them so tests can wait for them to finish
			const originalEditRecords = processor.processEditRecordsAsync;
			processor.processEditRecordsAsync = (...args) => trackPendingWork(originalEditRecords(...args));
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);

		workerPool = lyricProvider.configs.workerPool;
		originalDataValidation = workerPool.dataValidation;
		workerPool.dataValidation = (input) =>
			runValidationJobs ? trackPendingWork(originalDataValidation(input)) : Promise.resolve();
	});

	beforeEach(async () => {
		pendingWork = [];
		runValidationJobs = false;

		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});
		dictionaryId = dictionary.id;

		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});
		categoryId = category.id;

		submissionId = await lyricProvider.repositories.submission.save({
			createdBy: '',
			dictionaryCategoryId: categoryId,
			dictionaryId,
			organization: ORGANIZATION,
			status: SUBMISSION_STATUS.OPEN,
		});

		await saveSubmittedData({ entityName: 'sport', systemId: 'SPORT1', data: { sport_id: '1', name: 'Soccer' } });
		await saveSubmittedData({ entityName: 'sport', systemId: 'SPORT2', data: { sport_id: '2', name: 'Hockey' } });
		await saveSubmittedData({
			entityName: 'team',
			systemId: 'TEAM1',
			data: { team_id: 'T1', sport_id: '1', name: 'Lions' },
		});
	});

	afterEach(async () => {
		await waitForPendingWork();
		await getContainers().resetDatabases();
	});

	after(async () => {
		workerPool.dataValidation = originalDataValidation;
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.shutdown();
	});

	describe('Rejecting records that do not identify Submitted Data', () => {
		it('should reject an edit with an unknown System ID and stage nothing', async () => {
			const response = await editSports([
				{ systemId: 'SPORT1', sport_id: '1', name: 'Football' },
				{ systemId: 'UNKNOWN1', sport_id: '9', name: 'Curling' },
			]);

			expect(response.status).to.equal(200);
			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include("'UNKNOWN1' not found");
			expect(await getRecords()).to.eql([]);
		});

		it('should reject an edit with a System ID of another entity', async () => {
			const response = await editSports([{ systemId: 'TEAM1', sport_id: '1', name: 'Football' }]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include("'TEAM1' not found in entity 'sport'");
			expect(await getRecords()).to.eql([]);
		});

		it('should reject an edit with a System ID of another organization', async () => {
			await saveSubmittedData({
				entityName: 'sport',
				organization: OTHER_ORGANIZATION,
				systemId: 'SPORT_OTHER',
				data: { sport_id: '5', name: 'Rugby' },
			});

			const response = await editSports([{ systemId: 'SPORT_OTHER', sport_id: '5', name: 'Rugby League' }]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include(
				`'SPORT_OTHER' not found in entity 'sport' of organization '${ORGANIZATION}'`,
			);
			expect(await getRecords()).to.eql([]);
		});

		it('should reject an edit with a record without a System ID, reporting its line', async () => {
			const response = await editSports([
				{ systemId: 'SPORT1', sport_id: '1', name: 'Football' },
				{ sport_id: '9', name: 'Curling' },
			]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include('line(s) 3 have no systemId');
			expect(await getRecords()).to.eql([]);
		});

		it('should reject an edit that sends the same System ID twice', async () => {
			const response = await editSports([
				{ systemId: 'SPORT1', sport_id: '1', name: 'Football' },
				{ systemId: 'SPORT1', sport_id: '1', name: 'Futbol' },
			]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include("'SPORT1' appear more than once");
			expect(await getRecords()).to.eql([]);
		});
	});

	describe('Rejecting records that already have a change staged', () => {
		it('should reject an edit of a System ID that already has an UPDATE staged', async () => {
			const firstResponse = await editSports([{ systemId: 'SPORT1', sport_id: '1', name: 'Football' }]);
			expect(firstResponse.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.PROCESSING);

			const response = await editSports([
				{ systemId: 'SPORT2', sport_id: '2', name: 'Ice Hockey' },
				{ systemId: 'SPORT1', sport_id: '1', name: 'Futbol' },
			]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include("an update staged for System ID(s) 'SPORT1'");
			const records = await getRecords();
			expect(records.map((record) => [record.actionType, record.data.systemId])).to.eql([['UPDATE', 'SPORT1']]);
		});

		it('should reject an edit of a System ID that already has a DELETE staged', async () => {
			const deleteResponse = await app.delete(`/category/${categoryId}/data/SPORT2`);
			expect(deleteResponse.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.PROCESSING);

			const response = await editSports([{ systemId: 'SPORT2', sport_id: '2', name: 'Ice Hockey' }]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION);
			expect(response.body.description).to.include("a delete staged for System ID(s) 'SPORT2'");
			const records = await getRecords();
			expect(records.map((record) => [record.actionType, record.data.systemId])).to.eql([['DELETE', 'SPORT2']]);
		});

		it('should stage an edit of a System ID without a staged change while another one has an UPDATE staged', async () => {
			await editSports([{ systemId: 'SPORT1', sport_id: '1', name: 'Football' }]);

			const response = await editSports([{ systemId: 'SPORT2', sport_id: '2', name: 'Ice Hockey' }]);

			expect(response.body.status).to.equal(ACTIVE_SUBMISSION_STATUS.PROCESSING);
			const records = await getRecords();
			expect(records.map((record) => record.data.systemId)).to.have.members(['SPORT1', 'SPORT2']);
		});
	});

	describe('Validating a System ID with more than one UPDATE staged', () => {
		it('should mark every UPDATE of that System ID INVALID, and the Submission INVALID', async () => {
			const { submissionFiles, submissionRecords } = lyricProvider.repositories;
			for (const name of ['Football', 'Futbol']) {
				const fileId = await submissionFiles.save({
					entityName: 'sport',
					fileName: `${name}.json`,
					fileSize: 0,
					submissionId,
				});
				await submissionRecords.saveManyForFile(fileId, [
					{
						actionType: 'UPDATE',
						data: { systemId: 'SPORT1', old: { name: 'Soccer' }, new: { name } },
						lineNumber: 2,
						state: 'RECEIVED',
					},
				]);
			}
			runValidationJobs = true;

			await workerPool.dataValidation({ submissionId, username: '', version: 0 });
			await waitForPendingWork();

			const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
			expect(submission?.status).to.equal(SUBMISSION_STATUS.INVALID);
			const records = await getRecords();
			expect(records.map((record) => record.state)).to.eql(['INVALID', 'INVALID']);
			records.forEach((record) =>
				expect(record.errors).to.deep.include({
					reason: 'CONFLICTING_ACTION',
					systemId: 'SPORT1',
					conflictingActionType: 'UPDATE',
					message: "Record with systemId 'SPORT1' has more than one UPDATE staged in the same Active Submission",
				}),
			);
		});
	});
});
