import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { DataRecord } from '@overture-stack/lectern-client';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { SUBMISSION_STATUS } from '../../../../src/utils/types.js';
import type { WorkerFunctions } from '../../../../src/workers/types.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const ORGANIZATION = 'testOrg';

/**
 * These tests check how records the system stages on its own, for records that depend on the user's changes, are kept
 * apart from the user's records:
 * - they are saved in system-generated files, each record pointing to the record that caused it
 * - a user's update to an ID field is carried out by the system's DELETE and INSERT, which validation and commit use
 *   in its place
 * - users can't remove a system-generated file
 * - removing the user's file removes the records it caused, and system-generated files left without records
 *
 * Validation jobs only run when a test enables them, so the records left by staging can be inspected.
 */
describe('Integration - Submission Router - System-generated files', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let workerPool: WorkerFunctions;
	let categoryId: number;
	let dictionaryId: number;
	let submissionId: number;

	let originalCreate: typeof submissionProcessorFactory.create;
	let originalDataValidation: WorkerFunctions['dataValidation'];
	let originalCommitSubmission: WorkerFunctions['commitSubmission'];
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

	const saveSubmittedData = (entityName: string, systemId: string, data: DataRecord) =>
		lyricProvider.repositories.submittedData.save({
			data,
			dictionaryCategoryId: categoryId,
			entityName,
			isValid: true,
			organization: ORGANIZATION,
			originalSchemaId: dictionaryId,
			systemId,
		});

	const getFiles = async () =>
		(await lyricProvider.repositories.submissionFiles.getBySubmissionId(submissionId)).sort((a, b) => a.id - b.id);

	const getRecords = async () =>
		(await lyricProvider.repositories.submissionRecords.getBySubmissionId(submissionId)).records;

	const findFile = async ({ entityName, actionType }: { entityName: string; actionType: string }) => {
		const records = await getRecords();
		const fileId = records.find(
			(record) => record.entityName === entityName && record.actionType === actionType,
		)?.fileId;
		const file = (await getFiles()).find(({ id }) => id === fileId);
		if (!file) {
			throw new Error(`No ${actionType} file for entity '${entityName}'`);
		}
		return file;
	};

	const editSportId = async () => {
		const response = await app
			.put(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
			.send([{ systemId: 'SPORT1', sport_id: '2', name: 'Soccer' }]);
		expect(response.status).to.equal(200);
		await waitForPendingWork();
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
		originalCommitSubmission = workerPool.commitSubmission;
		workerPool.dataValidation = (input) =>
			runValidationJobs ? trackPendingWork(originalDataValidation(input)) : Promise.resolve();
		workerPool.commitSubmission = (input) => trackPendingWork(originalCommitSubmission(input));
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

		await saveSubmittedData('sport', 'SPORT1', { sport_id: '1', name: 'Soccer' });
		await saveSubmittedData('team', 'TEAM1', { team_id: 'T1', sport_id: '1', name: 'Lions' });
	});

	afterEach(async () => {
		await waitForPendingWork();
		await getContainers().resetDatabases();
	});

	after(async () => {
		workerPool.dataValidation = originalDataValidation;
		workerPool.commitSubmission = originalCommitSubmission;
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.shutdown();
	});

	describe('Editing an ID field that other records reference', () => {
		it("should stage the user's update in a user file, and the DELETE, INSERT and dependent updates carrying it out in system-generated files", async () => {
			await editSportId();

			const sportUpdateFile = await findFile({ entityName: 'sport', actionType: 'UPDATE' });
			const sportDeleteFile = await findFile({ entityName: 'sport', actionType: 'DELETE' });
			const sportInsertFile = await findFile({ entityName: 'sport', actionType: 'INSERT' });
			const teamUpdateFile = await findFile({ entityName: 'team', actionType: 'UPDATE' });
			expect(
				[sportUpdateFile, sportDeleteFile, sportInsertFile, teamUpdateFile].map((file) => file.isSystemGenerated),
			).to.eql([false, true, true, true]);

			const records = await getRecords();
			const recordInFile = (fileId: number) => records.find((record) => record.fileId === fileId);
			const sportUpdate = recordInFile(sportUpdateFile.id);
			const sportDelete = recordInFile(sportDeleteFile.id);
			expect(records).to.have.lengthOf(4);
			expect(sportUpdate).to.include({ appliedByChildren: true, lineNumber: 2, parentRecordId: null });
			expect(sportDelete).to.include({ appliedByChildren: false, parentRecordId: sportUpdate?.id });
			expect(recordInFile(sportInsertFile.id)).to.include({
				appliedByChildren: false,
				parentRecordId: sportUpdate?.id,
			});
			expect(recordInFile(teamUpdateFile.id)).to.include({ appliedByChildren: false, parentRecordId: sportDelete?.id });
		});

		it("should number the user's updates by the line they were sent on, skipping unchanged records", async () => {
			await saveSubmittedData('sport', 'SPORT2', { sport_id: '3', name: 'Hockey' });
			await saveSubmittedData('sport', 'SPORT3', { sport_id: '4', name: 'Rugby' });

			const response = await app
				.put(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
				.send([
					{ systemId: 'SPORT2', sport_id: '3', name: 'Hockey' },
					{ systemId: 'SPORT3', sport_id: '4', name: 'Rugby League' },
					{ systemId: 'SPORT1', sport_id: '2', name: 'Soccer' },
				]);
			expect(response.status).to.equal(200);
			await waitForPendingWork();

			const sportUpdateFile = await findFile({ entityName: 'sport', actionType: 'UPDATE' });
			const userUpdates = (await getRecords()).filter((record) => record.fileId === sportUpdateFile.id);
			expect(userUpdates.map((record) => [record.data.systemId, record.lineNumber])).to.eql([
				['SPORT3', 3],
				['SPORT1', 4],
			]);
		});

		it('should report which files are system-generated in the submission summary', async () => {
			await editSportId();

			const response = await app.get(`/${submissionId}`);

			expect(response.status).to.equal(200);
			const flags = (files: { isSystemGenerated: boolean }[]) => files.map((file) => file.isSystemGenerated);
			expect(flags(response.body.data.updates.sport)).to.eql([false]);
			expect(flags(response.body.data.updates.team)).to.eql([true]);
			expect(flags(response.body.data.inserts.sport)).to.eql([true]);
		});

		it('should reject removing a system-generated file and leave the submission unchanged', async () => {
			await editSportId();
			const sportDeleteFile = await findFile({ entityName: 'sport', actionType: 'DELETE' });
			const recordsBefore = await getRecords();

			const response = await app.delete(`/${submissionId}/data?fileId=${sportDeleteFile.id}`);

			expect(response.status).to.equal(400);
			expect(await getRecords()).to.have.lengthOf(recordsBefore.length);
			expect((await getFiles()).map(({ id }) => id)).to.include(sportDeleteFile.id);
		});

		it("should remove every record and system-generated file carrying out the update with the user's file", async () => {
			await editSportId();
			const sportUpdateFile = await findFile({ entityName: 'sport', actionType: 'UPDATE' });

			const response = await app.delete(`/${submissionId}/data?fileId=${sportUpdateFile.id}`);

			expect(response.status).to.equal(200);
			expect(await getFiles()).to.eql([]);
			expect(await getRecords()).to.eql([]);
		});

		it("should validate the records carrying out the update, and mark the user's update VALID with them", async () => {
			runValidationJobs = true;

			await editSportId();
			await waitForPendingWork();

			const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
			expect(submission?.status).to.equal(SUBMISSION_STATUS.VALID);
			expect((await getRecords()).map((record) => record.state)).to.eql(['VALID', 'VALID', 'VALID', 'VALID']);
		});

		it('should commit the update once, through its DELETE, INSERT and dependent updates', async () => {
			runValidationJobs = true;
			await editSportId();
			await waitForPendingWork();

			const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);
			await waitForPendingWork();

			expect(response.status).to.equal(200);
			const submittedData = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				ORGANIZATION,
			);
			const dataOf = (entityName: string) =>
				submittedData.filter((data) => data.entityName === entityName).map(({ data }) => data);
			expect(dataOf('sport')).to.eql([{ sport_id: '2', name: 'Soccer' }]);
			expect(dataOf('team')).to.eql([{ team_id: 'T1', sport_id: '2', name: 'Lions' }]);
		});
	});

	describe('Deleting submitted data that other records depend on', () => {
		beforeEach(async () => {
			await saveSubmittedData('player', 'PLAYER1', { player_id: 'P1', team_id: 'T1', name: 'Alex', age: 20 });
		});

		it("should stage the dependents' deletes in system-generated files, pointing to the user's DELETE record", async () => {
			const response = await app.delete(`/category/${categoryId}/data/SPORT1`);

			expect(response.status).to.equal(200);
			const sportFile = await findFile({ entityName: 'sport', actionType: 'DELETE' });
			const teamFile = await findFile({ entityName: 'team', actionType: 'DELETE' });
			const playerFile = await findFile({ entityName: 'player', actionType: 'DELETE' });
			expect([sportFile.isSystemGenerated, teamFile.isSystemGenerated, playerFile.isSystemGenerated]).to.eql([
				false,
				true,
				true,
			]);

			const records = await getRecords();
			const sportRecord = records.find((record) => record.fileId === sportFile.id);
			expect(sportRecord?.parentRecordId).to.equal(null);
			const dependentRecords = records.filter((record) => record.fileId !== sportFile.id);
			expect(dependentRecords).to.have.lengthOf(2);
			expect(dependentRecords.map((record) => record.parentRecordId)).to.eql([sportRecord?.id, sportRecord?.id]);
		});

		it("should list each entity's delete files in the submission summary, with the user's and the system's apart", async () => {
			await app.delete(`/category/${categoryId}/data/SPORT1`);
			const sportFile = await findFile({ entityName: 'sport', actionType: 'DELETE' });

			const response = await app.get(`/${submissionId}`);

			expect(response.status).to.equal(200);
			const { deletes } = response.body.data;
			expect(Object.keys(deletes)).to.have.members(['sport', 'team', 'player']);
			expect(deletes.sport).to.eql([
				{ batchName: sportFile.fileName, errors: 0, fileId: sportFile.id, isSystemGenerated: false, recordsCount: 1 },
			]);
			expect(deletes.team.map((file: { isSystemGenerated: boolean }) => file.isSystemGenerated)).to.eql([true]);
			expect(deletes.player.map((file: { isSystemGenerated: boolean }) => file.isSystemGenerated)).to.eql([true]);
		});

		it("should remove every dependent delete and system-generated file with the user's file", async () => {
			await app.delete(`/category/${categoryId}/data/SPORT1`);
			const sportFile = await findFile({ entityName: 'sport', actionType: 'DELETE' });

			const response = await app.delete(`/${submissionId}/data?fileId=${sportFile.id}`);

			expect(response.status).to.equal(200);
			expect(await getFiles()).to.eql([]);
			expect(await getRecords()).to.eql([]);
		});
	});
});
