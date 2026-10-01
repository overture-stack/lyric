import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { DataRecord } from '@overture-stack/lectern-client';
import type { NewSubmittedData } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../../assertions.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const organization = 'testOrg';

/**
 * Submitted data seeded before each test: one sport, two teams playing it and a player of the first team.
 * `sport.sport_id` is an ID field: `team.sport_id` references it, so changing it cascades to the teams.
 */
const seededRecords: { entityName: string; systemId: string; data: DataRecord }[] = [
	{ entityName: 'sport', systemId: 'SPT1', data: { sport_id: '1', name: 'Soccer' } },
	{ entityName: 'team', systemId: 'TM1', data: { team_id: '1', sport_id: '1', name: 'Lions' } },
	{ entityName: 'team', systemId: 'TM2', data: { team_id: '2', sport_id: '1', name: 'Tigers' } },
	{ entityName: 'player', systemId: 'PLR1', data: { player_id: '1', team_id: '1', name: 'Ann', age: 20 } },
];

/**
 * These tests check how edits are staged in an Active Submission: a new edit of a systemId replaces the one
 * already staged, an ID field change is staged as a parent UPDATE with its consequence records, and validation and
 * commit apply the staged edits consistently.
 */
describe('Integration - Submission Router - PUT /category/:categoryId/data - Staged edit replacement', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let originalCreate: typeof submissionProcessorFactory.create;
	let pendingWork: Promise<unknown>[] = [];

	/**
	 * Waits for every background task started so far, including the ones started by other background tasks
	 * (an edit queues a validation), so nothing runs past the end of a test.
	 */
	const awaitPendingWork = async (): Promise<void> => {
		while (pendingWork.length > 0) {
			const currentWork = pendingWork;
			pendingWork = [];
			await Promise.all(currentWork);
		}
	};

	const editRecords = async (entityName: string, records: Record<string, unknown>[]): Promise<number> => {
		const response = await app
			.put(`/category/${categoryId}/data?entityName=${entityName}&organization=${organization}`)
			.send(records);
		await awaitPendingWork();
		expect(response.status).to.eq(200);
		expect(response.body.status).to.eq('PROCESSING');
		return response.body.submissionId;
	};

	const getStagedRecords = async (submissionId: number): Promise<SubmissionRecordWithEntityName[]> => {
		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(submissionId);
		return submissionRecords.records;
	};

	const getSubmissionStatus = async (submissionId: number): Promise<string | undefined> => {
		const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
		return submission?.status;
	};

	const commitSubmission = async (submissionId: number): Promise<void> => {
		const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);
		await awaitPendingWork();
		expect(response.status).to.eq(200);
		expect(await getSubmissionStatus(submissionId)).to.eq('COMMITTED');
	};

	const getSubmittedRecords = async (): Promise<{ entityName: string; systemId: string; data: DataRecord }[]> => {
		const submittedData = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
			categoryId,
			organization,
		);
		return submittedData.map(({ entityName, systemId, data }) => ({ entityName, systemId, data }));
	};

	/** Staged records of an ID field change group: the parent UPDATE followed by its consequence records */
	const findGroup = (
		records: SubmissionRecordWithEntityName[],
		systemId: string,
	): { parent: SubmissionRecordWithEntityName; consequences: SubmissionRecordWithEntityName[] } => {
		const parent = records.find(
			(record) =>
				record.idFieldChange &&
				record.actionType === 'UPDATE' &&
				'systemId' in record.data &&
				record.data.systemId === systemId,
		);
		assertExists(parent);
		return { parent, consequences: records.filter((record) => record.parentRecord === parent.id) };
	};

	before(async () => {
		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);

			// processEditRecordsAsync is not awaited by the edit service so the response is not held up.
			// Capture its promise so each test can wait for the staging to finish
			const originalProcessEditRecords = processor.processEditRecordsAsync;
			processor.processEditRecordsAsync = (...args) => {
				const promise = originalProcessEditRecords(...args);
				pendingWork.push(promise);
				return promise;
			};
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);

		// Validation and commit run in worker processes without being awaited; capture their promises as well
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
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.shutdown();
	});

	it('should keep only the newest UPDATE when the same systemId is edited twice, and validate that one', async () => {
		await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);
		// The second edit is invalid: `name` is required
		const submissionId = await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: '' }]);

		const records = await getStagedRecords(submissionId);

		expect(records).to.have.lengthOf(1);
		assertExists(records[0]);
		expect(records[0].actionType).to.eq('UPDATE');
		expect(records[0].idFieldChange).to.eq(false);
		expect(records[0].parentRecord).to.eq(null);
		expect(records[0].data).to.deep.include({ systemId: 'TM1', old: { name: 'Lions' } });
		expect(records[0].state).to.eq('INVALID');
		expect(await getSubmissionStatus(submissionId)).to.eq('INVALID');
	});

	it('should stage an ID field change as a parent UPDATE with its DELETE, INSERT and dependent UPDATEs', async () => {
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);

		const records = await getStagedRecords(submissionId);
		const { parent, consequences } = findGroup(records, 'SPT1');

		expect(parent.data).to.eql({ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } });
		expect(parent.parentRecord).to.eq(null);
		// Every staged record is the parent or one of its consequences; the player has nothing to change
		expect(consequences).to.have.lengthOf(records.length - 1);

		const consequenceSummary = consequences.map(({ actionType, entityName, idFieldChange, data }) => ({
			actionType,
			entityName,
			idFieldChange,
			systemId: 'systemId' in data ? data.systemId : undefined,
		}));
		expect(consequenceSummary).to.have.deep.members([
			{ actionType: 'DELETE', entityName: 'sport', idFieldChange: false, systemId: 'SPT1' },
			{ actionType: 'INSERT', entityName: 'sport', idFieldChange: false, systemId: undefined },
			{ actionType: 'UPDATE', entityName: 'team', idFieldChange: false, systemId: 'TM1' },
			{ actionType: 'UPDATE', entityName: 'team', idFieldChange: false, systemId: 'TM2' },
		]);
		const insert = consequences.find((record) => record.actionType === 'INSERT');
		assertExists(insert);
		expect(insert.data).to.eql({ sport_id: '2', name: 'Soccer' });

		// The group is validated through its consequence records and is not a conflict with its own DELETE
		expect(await getSubmissionStatus(submissionId)).to.eq('VALID');
		expect(records.map((record) => record.state)).to.eql(records.map(() => 'VALID'));
	});

	it('should replace the whole group when the same systemId has its ID field changed twice', async () => {
		await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);

		const records = await getStagedRecords(submissionId);
		const { parent, consequences } = findGroup(records, 'SPT1');

		expect(records.filter((record) => record.idFieldChange)).to.have.lengthOf(1);
		expect(parent.data).to.eql({ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '3' } });
		expect(consequences).to.have.lengthOf(records.length - 1);
		expect(records.filter((record) => record.actionType === 'INSERT').map((record) => record.data)).to.eql([
			{ sport_id: '3', name: 'Soccer' },
		]);
		expect(records.filter((record) => record.actionType === 'DELETE')).to.have.lengthOf(1);
		expect(
			records
				.filter((record) => record.entityName === 'team')
				.map((record) => record.data)
				.map((data) => ('new' in data ? data.new : undefined)),
		).to.eql([{ sport_id: '3' }, { sport_id: '3' }]);

		// No generic file is left without records after the first group was replaced
		const files = await lyricProvider.repositories.submissionFiles.getBySubmissionId(submissionId);
		const fileIdsWithRecords = new Set(records.map((record) => record.fileId));
		expect(files.map((file) => file.id).filter((fileId) => !fileIdsWithRecords.has(fileId))).to.eql([]);
	});

	it('should replace a plain UPDATE with an ID field change group', async () => {
		await editRecords('sport', [{ systemId: 'SPT1', sport_id: '1', name: 'Football' }]);
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Football' }]);

		const records = await getStagedRecords(submissionId);
		const { parent, consequences } = findGroup(records, 'SPT1');

		expect(parent.data).to.eql({
			systemId: 'SPT1',
			old: { sport_id: '1', name: 'Soccer' },
			new: { sport_id: '2', name: 'Football' },
		});
		expect(consequences).to.have.lengthOf(records.length - 1);
		expect(
			records.filter((record) => record.entityName === 'sport' && record.actionType === 'UPDATE'),
		).to.have.lengthOf(1);
	});

	it('should replace an ID field change group with a plain UPDATE', async () => {
		await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '1', name: 'Football' }]);

		const records = await getStagedRecords(submissionId);

		expect(records).to.have.lengthOf(1);
		assertExists(records[0]);
		expect(records[0].idFieldChange).to.eq(false);
		expect(records[0].parentRecord).to.eq(null);
		expect(records[0].data).to.eql({ systemId: 'SPT1', old: { name: 'Soccer' }, new: { name: 'Football' } });
	});

	it('should leave no UPDATE staged when a record is edited back to its submitted values', async () => {
		await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);
		const submissionId = await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions' }]);

		expect(await getStagedRecords(submissionId)).to.eql([]);
	});

	it('should stage a single UPDATE when two edits of the same systemId are processed concurrently', async () => {
		const submissionId = await lyricProvider.services.submission.getOrCreateActiveSubmission({
			categoryId,
			organization,
			username: '',
		});
		const teamSchema = dictionarySportsData.find((schema) => schema.name === 'team');
		assertExists(teamSchema);
		const processor = submissionProcessorFactory.create(lyricProvider.configs);

		await Promise.all(
			['Lions FC', 'Lions United'].map((name) =>
				processor.processEditRecordsAsync([{ systemId: 'TM1', team_id: '1', sport_id: '1', name }], {
					schema: teamSchema,
					submissionId,
					username: '',
				}),
			),
		);
		await awaitPendingWork();

		const records = await getStagedRecords(submissionId);
		expect(records).to.have.lengthOf(1);
	});

	it('should reject a direct edit of a record that has a cascaded foreign key UPDATE staged', async () => {
		await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const submissionId = await editRecords('team', [
			{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' },
		]);

		// Nothing from the rejected request is staged: the cascaded UPDATE of TM1 is still the only one
		const records = await getStagedRecords(submissionId);
		const teamUpdates = records.filter(
			(record) => record.actionType === 'UPDATE' && 'systemId' in record.data && record.data.systemId === 'TM1',
		);
		expect(teamUpdates).to.have.lengthOf(1);
		assertExists(teamUpdates[0]);
		expect(teamUpdates[0].parentRecord).to.not.eq(null);
		expect(teamUpdates[0].data).to.deep.include({ new: { sport_id: '2' } });
	});

	it('should reject an ID field change that cascades to a record with a direct edit staged', async () => {
		await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);

		const records = await getStagedRecords(submissionId);

		expect(records).to.have.lengthOf(1);
		assertExists(records[0]);
		expect(records[0].entityName).to.eq('team');
		expect(records[0].data).to.deep.include({ systemId: 'TM1', new: { name: 'Lions FC' } });
	});

	it('should remove the consequence records when the parent UPDATE is removed', async () => {
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const { parent } = findGroup(await getStagedRecords(submissionId), 'SPT1');

		const response = await app.delete(`/${submissionId}/data?recordId=${parent.id}`);
		await awaitPendingWork();

		expect(response.status).to.eq(200);
		expect(await getStagedRecords(submissionId)).to.eql([]);
		// The team file only held cascaded records and is removed with them; the parent's own file is kept
		const files = await lyricProvider.repositories.submissionFiles.getBySubmissionId(submissionId);
		expect(files.map((file) => file.entityName)).to.eql(['sport']);
	});

	it('should reject removing a consequence record on its own', async () => {
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const recordsBefore = await getStagedRecords(submissionId);
		const { parent, consequences } = findGroup(recordsBefore, 'SPT1');
		const consequence = consequences[0];
		assertExists(consequence);

		const response = await app.delete(`/${submissionId}/data?recordId=${consequence.id}`);
		await awaitPendingWork();

		expect(response.status).to.eq(400);
		expect(response.body.message).to.include(`'${parent.id}'`);
		expect(await getStagedRecords(submissionId)).to.have.lengthOf(recordsBefore.length);
	});

	it('should remove the whole group when removing a file that holds only its cascaded records', async () => {
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const teamRecord = (await getStagedRecords(submissionId)).find((record) => record.entityName === 'team');
		assertExists(teamRecord);

		const response = await app.delete(`/${submissionId}/data?fileId=${teamRecord.fileId}`);
		await awaitPendingWork();

		expect(response.status).to.eq(200);
		expect(await getStagedRecords(submissionId)).to.eql([]);
	});

	it('should commit the newest plain edit', async () => {
		await editRecords('team', [{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions FC' }]);
		const submissionId = await editRecords('team', [
			{ systemId: 'TM1', team_id: '1', sport_id: '1', name: 'Lions United' },
		]);
		expect(await getSubmissionStatus(submissionId)).to.eq('VALID');

		await commitSubmission(submissionId);

		const submittedRecords = await getSubmittedRecords();
		const team = submittedRecords.find((record) => record.systemId === 'TM1');
		assertExists(team);
		expect(team.data).to.eql({ team_id: '1', sport_id: '1', name: 'Lions United' });
	});

	it('should commit an ID field change edited twice as exactly one replacement record referenced by its dependents', async () => {
		await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: 'Soccer' }]);
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '3', name: 'Soccer' }]);
		expect(await getSubmissionStatus(submissionId)).to.eq('VALID');

		await commitSubmission(submissionId);

		const submittedRecords = await getSubmittedRecords();
		const sports = submittedRecords.filter((record) => record.entityName === 'sport');
		expect(sports).to.have.lengthOf(1);
		assertExists(sports[0]);
		expect(sports[0].systemId).to.not.eq('SPT1');
		expect(sports[0].data).to.eql({ sport_id: '3', name: 'Soccer' });

		const teams = submittedRecords.filter((record) => record.entityName === 'team');
		expect(teams.map((team) => team.data['sport_id'])).to.eql(['3', '3']);
		const player = submittedRecords.find((record) => record.systemId === 'PLR1');
		assertExists(player);
		expect(player.data).to.eql({ player_id: '1', team_id: '1', name: 'Ann', age: 20 });
	});

	it('should mark the parent UPDATE invalid when one of its consequence records is invalid', async () => {
		// The replacement record is invalid: `name` is required
		const submissionId = await editRecords('sport', [{ systemId: 'SPT1', sport_id: '2', name: '' }]);

		const records = await getStagedRecords(submissionId);
		const { parent, consequences } = findGroup(records, 'SPT1');
		const insert = consequences.find((record) => record.actionType === 'INSERT');
		assertExists(insert);

		expect(insert.state).to.eq('INVALID');
		expect(parent.state).to.eq('INVALID');
		expect(parent.errors).to.eql([
			{
				reason: 'INVALID_CONSEQUENCE_RECORD',
				invalidRecordIds: [insert.id],
				message: `Record(s) '${insert.id}' staged as a consequence of this ID field change are invalid`,
			},
		]);
		expect(await getSubmissionStatus(submissionId)).to.eq('INVALID');
	});
});
