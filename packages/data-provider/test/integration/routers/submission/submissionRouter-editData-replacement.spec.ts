import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { DataRecord } from '@overture-stack/lectern-client';
import type { NewSubmittedData } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../../assertions.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const organization = 'testOrg';

/**
 * Submitted data seeded before each test:
 * - sport SPT1, played by teams TM1 and TM2; player PLR1 plays for TM1
 * - sport SPT2, played by team TM3
 *
 * `sport.sport_id` is an ID field: `team.sport_id` references it, so changing it cascades to the teams, and deleting a
 * sport deletes its teams and their players.
 */
const seededRecords: { entityName: string; systemId: string; data: DataRecord }[] = [
	{ entityName: 'sport', systemId: 'SPT1', data: { sport_id: '1', name: 'Soccer' } },
	{ entityName: 'sport', systemId: 'SPT2', data: { sport_id: '2', name: 'Hockey' } },
	{ entityName: 'team', systemId: 'TM1', data: { team_id: '1', sport_id: '1', name: 'Lions' } },
	{ entityName: 'team', systemId: 'TM2', data: { team_id: '2', sport_id: '1', name: 'Tigers' } },
	{ entityName: 'team', systemId: 'TM3', data: { team_id: '3', sport_id: '2', name: 'Bears' } },
	{ entityName: 'player', systemId: 'PLR1', data: { player_id: '1', team_id: '1', name: 'Ann', age: 20 } },
];

/** Summary of a staged record, to compare staged records without their generated IDs */
type StagedRecordSummary = {
	actionType: string;
	entityName: string;
	systemId: string | undefined;
	isParent: boolean;
};

/**
 * These tests check how an edit or a delete by systemId replaces the changes already staged for the same record, how
 * conflicts with records staged as the consequence of another change reject the whole request, and that the edit
 * endpoint finishes staging before it responds.
 */
describe('Integration - Submission Router - Staged change replacement and conflicts', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let dictionaryId: number;
	let pendingWork: Promise<unknown>[] = [];

	/**
	 * Waits for every validation and commit job started so far, including jobs started while waiting, so nothing runs
	 * past the end of a test.
	 */
	const awaitPendingWork = async (): Promise<void> => {
		while (pendingWork.length > 0) {
			const currentWork = pendingWork;
			pendingWork = [];
			await Promise.all(currentWork);
		}
	};

	const putEdit = async (entityName: string, records: Record<string, unknown>[]): Promise<supertest.Response> => {
		const response = await app
			.put(`/category/${categoryId}/data?entityName=${entityName}&organization=${organization}`)
			.send(records);
		await awaitPendingWork();
		return response;
	};

	const deleteBySystemId = async (systemId: string): Promise<supertest.Response> => {
		const response = await app.delete(`/category/${categoryId}/data/${systemId}`);
		await awaitPendingWork();
		return response;
	};

	/** Edits records and returns the ID of the Active Submission, expecting the edit to be accepted */
	const editRecords = async (entityName: string, records: Record<string, unknown>[]): Promise<number> => {
		const response = await putEdit(entityName, records);
		expect(response.status).to.eq(200);
		expect(response.body.status).to.eq('PROCESSING');
		return response.body.submissionId;
	};

	/** Deletes a record by its systemId and returns the ID of the Active Submission, expecting it to be accepted */
	const deleteRecord = async (systemId: string): Promise<number> => {
		const response = await deleteBySystemId(systemId);
		expect(response.status).to.eq(200);
		expect(response.body.status).to.eq('PROCESSING');
		return Number(response.body.submissionId);
	};

	const getStagedRecords = async (submissionId: number): Promise<SubmissionRecordWithEntityName[]> => {
		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(submissionId);
		return submissionRecords.records;
	};

	const summarize = (records: SubmissionRecordWithEntityName[]): StagedRecordSummary[] =>
		records.map(({ actionType, entityName, data, parentRecord }) => ({
			actionType,
			entityName,
			systemId: 'systemId' in data && typeof data.systemId === 'string' ? data.systemId : undefined,
			isParent: !parentRecord,
		}));

	const findStagedRecord = (
		records: SubmissionRecordWithEntityName[],
		{ actionType, systemId }: { actionType: string; systemId: string },
	): SubmissionRecordWithEntityName => {
		const found = records.find(
			(record) => record.actionType === actionType && 'systemId' in record.data && record.data.systemId === systemId,
		);
		assertExists(found);
		return found;
	};

	const getSubmission = async (submissionId: number): Promise<{ status: string; version: number }> => {
		const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
		assertExists(submission);
		return submission;
	};

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);

		// Validation and commit run in worker processes without being awaited; capture their promises
		const workerPool = lyricProvider.configs.workerPool;
		const originalDataValidation = workerPool.dataValidation;
		workerPool.dataValidation = (input) => {
			const promise = originalDataValidation(input);
			pendingWork.push(promise);
			return promise;
		};
		const originalCommitSubmission = workerPool.commitSubmission;
		workerPool.commitSubmission = (input) => {
			const promise = originalCommitSubmission(input);
			pendingWork.push(promise);
			return promise;
		};
	});

	beforeEach(async () => {
		pendingWork = [];

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

		const newSubmittedData: NewSubmittedData[] = seededRecords.map(({ entityName, systemId, data }) => ({
			data,
			dictionaryCategoryId: category.id,
			entityName,
			isValid: true,
			lastValidSchemaId: dictionary.id,
			organization,
			originalSchemaId: dictionary.id,
			systemId,
		}));
		await lyricProvider.repositories.submittedData.save(newSubmittedData);
	});

	afterEach(async () => {
		await awaitPendingWork();
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	describe('Replacement', () => {
		it('should replace a staged UPDATE with a new UPDATE, listing the discarded change', async () => {
			const submissionId = await editRecords('team', [
				{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' },
			]);
			const [firstUpdate] = await getStagedRecords(submissionId);
			assertExists(firstUpdate);

			const response = await putEdit('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions United' }]);

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([
				{
					recordId: firstUpdate.id,
					systemId: 'TM1',
					entityName: 'team',
					actionType: 'UPDATE',
					idFieldChange: false,
					data: { systemId: 'TM1', old: { name: 'Lions' }, new: { name: 'Lions FC' } },
				},
			]);
			expect(response.body.description).to.include('removed from the submission');
			const records = await getStagedRecords(submissionId);
			expect(records).to.have.lengthOf(1);
			expect(records[0]?.data).to.deep.include({ new: { name: 'Lions United' } });
		});

		it('should return an empty replacedRecords list when nothing was staged for the record', async () => {
			const response = await putEdit('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([]);
		});

		it('should replace a staged UPDATE with a DELETE', async () => {
			const submissionId = await editRecords('team', [
				{ systemId: 'TM2', team_id: '2', sport_id: '1', name: 'Tigers FC' },
			]);
			const [stagedUpdate] = await getStagedRecords(submissionId);
			assertExists(stagedUpdate);

			const response = await deleteBySystemId('TM2');

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([
				{
					recordId: stagedUpdate.id,
					systemId: 'TM2',
					entityName: 'team',
					actionType: 'UPDATE',
					idFieldChange: false,
					data: { systemId: 'TM2', old: { name: 'Tigers' }, new: { name: 'Tigers FC' } },
				},
			]);
			expect(summarize(await getStagedRecords(submissionId))).to.eql([
				{ actionType: 'DELETE', entityName: 'team', systemId: 'TM2', isParent: true },
			]);
		});

		it('should replace a staged DELETE group with an UPDATE, removing the dependent DELETEs without listing them', async () => {
			const submissionId = await deleteRecord('SPT1');
			const stagedDeletes = await getStagedRecords(submissionId);
			const parentDelete = findStagedRecord(stagedDeletes, { actionType: 'DELETE', systemId: 'SPT1' });
			// The dependents' DELETEs reference the DELETE of the sport
			expect(summarize(stagedDeletes)).to.have.deep.members([
				{ actionType: 'DELETE', entityName: 'sport', systemId: 'SPT1', isParent: true },
				{ actionType: 'DELETE', entityName: 'team', systemId: 'TM1', isParent: false },
				{ actionType: 'DELETE', entityName: 'team', systemId: 'TM2', isParent: false },
				{ actionType: 'DELETE', entityName: 'player', systemId: 'PLR1', isParent: false },
			]);
			expect(stagedDeletes.filter((record) => record.parentRecord).map((record) => record.parentRecord)).to.eql([
				parentDelete.id,
				parentDelete.id,
				parentDelete.id,
			]);

			const response = await putEdit('sport', [{ systemId: 'SPT1', sport_id: '1', name: 'Football' }]);

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([
				{
					recordId: parentDelete.id,
					systemId: 'SPT1',
					entityName: 'sport',
					actionType: 'DELETE',
					idFieldChange: false,
					data: parentDelete.data,
				},
			]);
			expect(summarize(await getStagedRecords(submissionId))).to.eql([
				{ actionType: 'UPDATE', entityName: 'sport', systemId: 'SPT1', isParent: true },
			]);
		});

		it('should replace an ID field change group with a DELETE group', async () => {
			const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);
			const idFieldChange = findStagedRecord(await getStagedRecords(submissionId), {
				actionType: 'UPDATE',
				systemId: 'SPT1',
			});
			expect(idFieldChange.idFieldChange).to.eq(true);

			const response = await deleteBySystemId('SPT1');

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([
				{
					recordId: idFieldChange.id,
					systemId: 'SPT1',
					entityName: 'sport',
					actionType: 'UPDATE',
					idFieldChange: true,
					data: { systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '3' } },
				},
			]);
			expect(response.body.inProcessEntities).to.have.members(['sport', 'team', 'player']);
			// The DELETE, INSERT and cascaded UPDATEs of the ID field change are gone
			expect(summarize(await getStagedRecords(submissionId))).to.have.deep.members([
				{ actionType: 'DELETE', entityName: 'sport', systemId: 'SPT1', isParent: true },
				{ actionType: 'DELETE', entityName: 'team', systemId: 'TM1', isParent: false },
				{ actionType: 'DELETE', entityName: 'team', systemId: 'TM2', isParent: false },
				{ actionType: 'DELETE', entityName: 'player', systemId: 'PLR1', isParent: false },
			]);
		});

		it('should replace a DELETE group with an ID field change group', async () => {
			const submissionId = await deleteRecord('SPT1');
			const parentDelete = findStagedRecord(await getStagedRecords(submissionId), {
				actionType: 'DELETE',
				systemId: 'SPT1',
			});

			const response = await putEdit('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);

			expect(response.status).to.eq(200);
			expect(
				response.body.replacedRecords.map(({ recordId, actionType }: { recordId: number; actionType: string }) => [
					recordId,
					actionType,
				]),
			).to.eql([[parentDelete.id, 'DELETE']]);
			expect(summarize(await getStagedRecords(submissionId))).to.have.deep.members([
				{ actionType: 'UPDATE', entityName: 'sport', systemId: 'SPT1', isParent: true },
				{ actionType: 'DELETE', entityName: 'sport', systemId: 'SPT1', isParent: false },
				{ actionType: 'INSERT', entityName: 'sport', systemId: undefined, isParent: false },
				{ actionType: 'UPDATE', entityName: 'team', systemId: 'TM1', isParent: false },
				{ actionType: 'UPDATE', entityName: 'team', systemId: 'TM2', isParent: false },
			]);
		});

		it('should replace an ID field change group with a plain UPDATE, listing only the parent', async () => {
			const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);
			const idFieldChange = findStagedRecord(await getStagedRecords(submissionId), {
				actionType: 'UPDATE',
				systemId: 'SPT1',
			});

			const response = await putEdit('sport', [{ systemId: 'SPT1', sport_id: '1', name: 'Football' }]);

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.have.lengthOf(1);
			expect(response.body.replacedRecords[0]).to.deep.include({ recordId: idFieldChange.id, idFieldChange: true });
			expect(summarize(await getStagedRecords(submissionId))).to.eql([
				{ actionType: 'UPDATE', entityName: 'sport', systemId: 'SPT1', isParent: true },
			]);
		});
	});

	describe('DELETE overlapping DELETE', () => {
		it('should change nothing when a record that already has a DELETE staged is deleted again', async () => {
			const submissionId = await deleteRecord('TM3');
			const recordsBefore = await getStagedRecords(submissionId);
			const submissionBefore = await getSubmission(submissionId);

			const response = await deleteBySystemId('TM3');

			expect(response.status).to.eq(200);
			expect(response.body.status).to.eq('PROCESSING');
			expect(response.body.description).to.include('already staged for deletion');
			expect(response.body.replacedRecords).to.eql([]);
			expect(response.body.inProcessEntities).to.eql([]);
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
			expect(await getSubmission(submissionId)).to.deep.include({
				status: submissionBefore.status,
				version: submissionBefore.version,
			});
		});

		it('should change nothing when a record already staged as a dependent DELETE is deleted directly', async () => {
			const submissionId = await deleteRecord('SPT1');
			const recordsBefore = await getStagedRecords(submissionId);

			const response = await deleteBySystemId('TM1');

			expect(response.status).to.eq(200);
			expect(response.body.description).to.include('already staged for deletion');
			expect(response.body.replacedRecords).to.eql([]);
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
		});

		it('should skip a dependent DELETE of a record that already has a direct DELETE staged', async () => {
			const submissionId = await deleteRecord('TM1');
			const teamDelete = findStagedRecord(await getStagedRecords(submissionId), {
				actionType: 'DELETE',
				systemId: 'TM1',
			});

			const response = await deleteBySystemId('SPT1');

			expect(response.status).to.eq(200);
			expect(response.body.replacedRecords).to.eql([]);
			const records = await getStagedRecords(submissionId);
			const sportDelete = findStagedRecord(records, { actionType: 'DELETE', systemId: 'SPT1' });
			// TM1 keeps its own DELETE and PLR1 keeps the DELETE staged with it; only TM2 is added for the sport
			expect(records.filter((record) => record.actionType === 'DELETE')).to.have.lengthOf(4);
			expect(findStagedRecord(records, { actionType: 'DELETE', systemId: 'TM1' })).to.deep.include({
				id: teamDelete.id,
				parentRecord: null,
			});
			expect(findStagedRecord(records, { actionType: 'DELETE', systemId: 'PLR1' }).parentRecord).to.eq(teamDelete.id);
			expect(findStagedRecord(records, { actionType: 'DELETE', systemId: 'TM2' }).parentRecord).to.eq(sportDelete.id);
		});
	});

	describe('Conflicts', () => {
		it('should reject an edit of a record staged as a dependent DELETE, staging nothing and describing the conflict', async () => {
			const submissionId = await deleteRecord('SPT1');
			const recordsBefore = await getStagedRecords(submissionId);
			const submissionBefore = await getSubmission(submissionId);
			const sportDelete = findStagedRecord(recordsBefore, { actionType: 'DELETE', systemId: 'SPT1' });
			const teamDelete = findStagedRecord(recordsBefore, { actionType: 'DELETE', systemId: 'TM1' });

			const response = await putEdit('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);

			expect(response.status).to.eq(409);
			expect(response.body.error).to.eq('Conflict');
			expect(response.body.message).to.include('Nothing from the request was staged');
			expect(response.body.details.conflicts).to.have.lengthOf(1);
			expect(response.body.details.conflicts[0]).to.deep.include({
				reason: 'TARGETS_CONSEQUENCE_RECORD',
				incomingRecord: { entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
				conflictingRecord: { recordId: teamDelete.id, entityName: 'team', systemId: 'TM1', actionType: 'DELETE' },
				parentRecord: {
					recordId: sportDelete.id,
					entityName: 'sport',
					systemId: 'SPT1',
					actionType: 'DELETE',
					idFieldChange: false,
				},
			});
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
			expect((await getSubmission(submissionId)).version).to.eq(submissionBefore.version);
		});

		it('should reject an ID field change whose cascaded UPDATE targets a record with a direct edit staged', async () => {
			const submissionId = await editRecords('team', [
				{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' },
			]);
			const recordsBefore = await getStagedRecords(submissionId);
			const [teamUpdate] = recordsBefore;
			assertExists(teamUpdate);

			const response = await putEdit('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);

			expect(response.status).to.eq(409);
			expect(response.body.details.conflicts).to.eql([
				{
					reason: 'CONSEQUENCE_COLLISION',
					message: response.body.details.conflicts[0].message,
					incomingRecord: { entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
					conflictingRecord: { recordId: teamUpdate.id, entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
					parentRecord: { entityName: 'sport', systemId: 'SPT1', actionType: 'UPDATE', idFieldChange: true },
				},
			]);
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
		});

		it('should reject a delete whose dependent DELETE targets a record with a direct edit staged', async () => {
			const submissionId = await editRecords('team', [
				{ systemId: 'TM2', team_id: '2', sport_id: '1', name: 'Tigers FC' },
			]);
			const recordsBefore = await getStagedRecords(submissionId);

			const response = await deleteBySystemId('SPT1');

			expect(response.status).to.eq(409);
			expect(
				response.body.details.conflicts.map(
					({
						reason,
						incomingRecord,
					}: {
						reason: string;
						incomingRecord: { systemId: string; actionType: string };
					}) => [reason, incomingRecord.systemId, incomingRecord.actionType],
				),
			).to.eql([['CONSEQUENCE_COLLISION', 'TM2', 'DELETE']]);
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
		});

		it('should reject a whole batch when one of its records conflicts', async () => {
			const submissionId = await deleteRecord('SPT2');
			const recordsBefore = await getStagedRecords(submissionId);

			const response = await putEdit('team', [
				{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' },
				{ systemId: 'TM3', team_id: '3', sport_id: '2', name: 'Bears FC' },
			]);

			expect(response.status).to.eq(409);
			expect(
				response.body.details.conflicts.map(
					({ incomingRecord }: { incomingRecord: { systemId: string } }) => incomingRecord.systemId,
				),
			).to.eql(['TM3']);
			// The edit of TM1, which does not conflict, is not staged either
			expect(await getStagedRecords(submissionId)).to.eql(recordsBefore);
		});

		it('should reject an edit with 409 while the submission is VALIDATING', async () => {
			const submissionId = await lyricProvider.repositories.submission.save({
				createdBy: '',
				dictionaryCategoryId: categoryId,
				dictionaryId,
				organization,
				status: 'VALIDATING',
			});

			const response = await putEdit('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);

			expect(response.status).to.eq(409);
			expect(await getStagedRecords(submissionId)).to.eql([]);
			expect((await getSubmission(submissionId)).status).to.eq('VALIDATING');
		});

		it('should reject a delete with 409 while the submission is VALIDATING', async () => {
			const submissionId = await lyricProvider.repositories.submission.save({
				createdBy: '',
				dictionaryCategoryId: categoryId,
				dictionaryId,
				organization,
				status: 'VALIDATING',
			});

			const response = await deleteBySystemId('TM3');

			expect(response.status).to.eq(409);
			expect(await getStagedRecords(submissionId)).to.eql([]);
		});
	});

	describe('Synchronous staging', () => {
		it('should respond to an edit after its records are staged', async () => {
			const response = await app
				.put(`/category/${categoryId}/data?entityName=sport&organization=${organization}`)
				.send([{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);

			// Checked before waiting for the background validation
			expect(response.status).to.eq(200);
			const records = await getStagedRecords(response.body.submissionId);
			expect(summarize(records)).to.have.deep.members([
				{ actionType: 'UPDATE', entityName: 'sport', systemId: 'SPT1', isParent: true },
				{ actionType: 'DELETE', entityName: 'sport', systemId: 'SPT1', isParent: false },
				{ actionType: 'INSERT', entityName: 'sport', systemId: undefined, isParent: false },
				{ actionType: 'UPDATE', entityName: 'team', systemId: 'TM1', isParent: false },
				{ actionType: 'UPDATE', entityName: 'team', systemId: 'TM2', isParent: false },
			]);
			expect((await getSubmission(response.body.submissionId)).version).to.eq(1);

			await awaitPendingWork();
		});

		it('should validate and commit the change that replaced a DELETE group, keeping the dependents', async () => {
			await deleteRecord('SPT1');
			const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '1', name: 'Football' }]);
			expect((await getSubmission(submissionId)).status).to.eq('VALID');

			const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);
			await awaitPendingWork();

			expect(response.status).to.eq(200);
			expect((await getSubmission(submissionId)).status).to.eq('COMMITTED');
			const submittedData = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				organization,
			);
			const submittedRecords = submittedData.map(({ systemId, data }) => ({ systemId, data }));
			expect(submittedRecords).to.have.deep.members(
				seededRecords.map(({ systemId, data }) =>
					systemId === 'SPT1' ? { systemId, data: { sport_id: '1', name: 'Football' } } : { systemId, data },
				),
			);
		});
	});
});
