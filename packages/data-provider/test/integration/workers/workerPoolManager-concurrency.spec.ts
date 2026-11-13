import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';

import type { MigrationStatus, SubmissionStatus } from '../../../src/utils/types.js';
import { dictionarySportsData } from '../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../assertions.js';
import { createLyricProvider, type LyricProvider } from '../dependencies/lyricProvider.js';
import { getContainers } from '../globalSetup.js';

const WORKER_COUNT = 3;
const TASK_COUNT = WORKER_COUNT * 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Integration - Worker Pool - concurrent tasks across several workers', () => {
	let lyricProvider: LyricProvider;
	const onFinishCommit = sinon.stub().resolves();

	// A new provider, and so a new pool, for every test: workers initialized by one test's tasks
	// must not hide a missing initialization in the next test's task type.
	beforeEach(async () => {
		onFinishCommit.resetHistory();
		// With more than one worker allowed, concurrent tasks make the pool start workers other than
		// the first one, which is the only one initialized at startup.
		lyricProvider = await createLyricProvider({
			...getContainers().providerConfig,
			onFinishCommit,
			workerPool: { maxWorkers: WORKER_COUNT },
		});
	});

	afterEach(async () => {
		await lyricProvider.shutdown();
		await getContainers().resetDatabases();
	});

	/**
	 * Saves one submission per organization in the given status, each inserting a single valid sport record.
	 * @returns the ids of the saved submissions
	 */
	const saveSubmissions = async (status: SubmissionStatus): Promise<number[]> => {
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});
		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});

		return Promise.all(
			Array.from({ length: TASK_COUNT }, (_, index) =>
				lyricProvider.repositories.submission.save({
					data: {
						inserts: {
							sport: { batchName: 'sports.tsv', records: [{ sport_id: `${index}`, name: `Sport ${index}` }] },
						},
					},
					dictionaryCategoryId: category.id,
					dictionaryId: dictionary.id,
					organization: `org-${index}`,
					status,
					createdBy: 'test-user',
				}),
			),
		);
	};

	const getStatuses = (submissionIds: number[]): Promise<SubmissionStatus[]> =>
		Promise.all(
			submissionIds.map(async (submissionId) => {
				const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
				assertExists(submission);
				return submission.status;
			}),
		);

	it('validates every submission when validations run at the same time', async () => {
		// Given: several submissions waiting in VALIDATING, one per organization
		const submissionIds = await saveSubmissions('VALIDATING');

		// When: their validations run concurrently on the pool
		await Promise.all(
			submissionIds.map((submissionId) => lyricProvider.configs.workerPool.dataValidation({ submissionId })),
		);

		// Then: every one of them is validated
		expect(await getStatuses(submissionIds)).to.deep.equal(submissionIds.map(() => 'VALID'));
	});

	it('commits every submission and reports each one when commits run at the same time', async () => {
		// Given: several submissions waiting in COMMITTING, one per organization
		const submissionIds = await saveSubmissions('COMMITTING');

		// When: their commits run concurrently on the pool
		await Promise.all(
			submissionIds.map((submissionId) =>
				lyricProvider.configs.workerPool.commitSubmission({ submissionId, username: 'test-user' }),
			),
		);

		// Then: every one of them is committed, and onFinishCommit runs once for each with its inserted record
		expect(await getStatuses(submissionIds)).to.deep.equal(submissionIds.map(() => 'COMMITTED'));

		const reportedCommits = onFinishCommit.getCalls().map((call) => call.args[0]);
		expect(reportedCommits.map((result) => result.submissionId)).to.have.members(submissionIds);
		reportedCommits.forEach((result) => {
			expect(result.data?.inserts).to.have.lengthOf(1);
		});
	});

	it('completes every dictionary migration when migrations run at the same time', async () => {
		// Given: one category per migration, each with a submitted record and a migration in IN_PROGRESS
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});

		const migrationIds = await Promise.all(
			Array.from({ length: TASK_COUNT }, async (_, index) => {
				const category = await lyricProvider.repositories.category.save({
					name: `sports-category-${index}`,
					activeDictionaryId: dictionary.id,
				});
				await lyricProvider.repositories.submittedData.save({
					data: { sport_id: `${index}`, name: `Sport ${index}` },
					dictionaryCategoryId: category.id,
					entityName: 'sport',
					isValid: true,
					lastValidSchemaId: dictionary.id,
					organization: `org-${index}`,
					originalSchemaId: dictionary.id,
					systemId: `SPORT-${index}`,
					createdBy: 'test-user',
					updatedBy: 'test-user',
				});
				const submissionId = await lyricProvider.repositories.submission.save({
					data: {},
					dictionaryCategoryId: category.id,
					dictionaryId: dictionary.id,
					organization: `org-${index}`,
					status: 'OPEN',
					createdBy: 'test-user',
				});
				return lyricProvider.repositories.migration.save({
					categoryId: category.id,
					fromDictionaryId: dictionary.id,
					toDictionaryId: dictionary.id,
					submissionId,
					status: 'IN_PROGRESS',
					createdBy: 'test-user',
				});
			}),
		);

		// When: their migrations run concurrently on the pool
		await Promise.all(
			migrationIds.map((migrationId) =>
				lyricProvider.configs.workerPool.dictionaryMigration({ migrationId, userName: 'test-user' }),
			),
		);

		// Then: every one of them completes. The worker records the final status without waiting for it,
		// so wait for every migration to leave IN_PROGRESS before reading the statuses.
		const getMigrationStatuses = (): Promise<MigrationStatus[]> =>
			Promise.all(
				migrationIds.map(async (migrationId) => {
					const migration = await lyricProvider.repositories.migration.getMigrationById(migrationId);
					assertExists(migration);
					return migration.status;
				}),
			);

		let statuses = await getMigrationStatuses();
		for (let attempt = 0; attempt < 20 && statuses.includes('IN_PROGRESS'); attempt += 1) {
			await sleep(250);
			statuses = await getMigrationStatuses();
		}
		expect(statuses).to.deep.equal(migrationIds.map(() => 'COMPLETED'));
	});
});
