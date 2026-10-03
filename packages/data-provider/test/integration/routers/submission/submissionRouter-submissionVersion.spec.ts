import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { StatusConflict } from '../../../../src/utils/errors.js';
import { SUBMISSION_STATUS, type SubmissionStatus } from '../../../../src/utils/types.js';
import type { CommitWorkerInput, DataValidationWorkerInput, WorkerFunctions } from '../../../../src/workers/types.js';
import { createTsvFileContent } from '../../../fixtures/createTsvContent.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../../assertions.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

const ORGANIZATION = 'testOrg';

const allSubmissionStatuses = Object.values(SUBMISSION_STATUS);

/**
 * These tests check that the Submission status and version keep validation and commit jobs consistent with the
 * records staged on the Submission:
 * - staging changes sets the status to OPEN and increments the version
 * - a commit is refused unless the Submission and all of its records are VALID
 * - validation jobs for an outdated version do nothing, and outdated validation results are discarded
 * - staging is rejected while the Submission is VALIDATING or COMMITTING
 *
 * Background work started by a request (staging, validation and commit jobs) is tracked and awaited by each test,
 * so nothing is still running when the database is reset.
 */
describe('Integration - Submission Router - Submission status and version', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let workerPool: WorkerFunctions;
	let categoryId: number;
	let dictionaryId: number;

	let originalCreate: typeof submissionProcessorFactory.create;
	let originalDataValidation: WorkerFunctions['dataValidation'];
	let originalCommitSubmission: WorkerFunctions['commitSubmission'];

	// When false, validation jobs are only recorded, not run, so the state left by staging can be inspected
	let runValidationJobs: boolean;
	let validationJobs: DataValidationWorkerInput[];
	let commitJobs: CommitWorkerInput[];
	let pendingWork: Promise<unknown>[];

	const trackPendingWork = <Result>(promise: Promise<Result>): Promise<Result> => {
		pendingWork.push(promise);
		return promise;
	};

	/**
	 * Waits for all tracked background work, including work queued by other background work while waiting.
	 */
	const waitForPendingWork = async (): Promise<void> => {
		while (pendingWork.length > 0) {
			const currentWork = pendingWork.splice(0);
			await Promise.allSettled(currentWork);
		}
	};

	const getSubmission = async (submissionId: number) => {
		const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
		assertExists(submission);
		return submission;
	};

	const getRecordStates = async (submissionId: number): Promise<string[]> => {
		const submissionRecords = await lyricProvider.repositories.submissionRecords.getBySubmissionId(submissionId);
		return submissionRecords.records.map((record) => record.state);
	};

	/**
	 * Creates a Submission owned by the anonymous test user, with the given status and version
	 */
	const createSubmission = async ({
		status,
		version = 0,
	}: {
		status: SubmissionStatus;
		version?: number;
	}): Promise<number> => {
		const submissionId = await lyricProvider.repositories.submission.save({
			createdBy: '',
			dictionaryCategoryId: categoryId,
			dictionaryId,
			organization: ORGANIZATION,
			status,
		});
		for (let increment = 0; increment < version; increment++) {
			await lyricProvider.repositories.submission.updateWithConditions({
				submissionId,
				newData: {},
				expectedStatuses: allSubmissionStatuses,
				incrementVersion: true,
			});
		}
		return submissionId;
	};

	/**
	 * Saves sport records on a Submission directly, bypassing the staging services
	 */
	const saveSportRecords = async ({
		submissionId,
		states,
	}: {
		submissionId: number;
		states: ('RECEIVED' | 'VALID' | 'INVALID')[];
	}): Promise<number[]> => {
		const fileId = await lyricProvider.repositories.submissionFiles.save({
			submissionId,
			fileName: 'sport.tsv',
			entityName: 'sport',
			fileSize: 100,
		});
		return lyricProvider.repositories.submissionRecords.saveManyForFile(
			fileId,
			states.map((state, index) => ({
				actionType: 'INSERT',
				data: { sport_id: `${index + 1}`, name: `Sport ${index + 1}` },
				lineNumber: index + 2,
				state,
			})),
		);
	};

	const submitSportRecords = async (records: Record<string, string>[]): Promise<number> => {
		const response = await app
			.post(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
			.send(records);
		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		await waitForPendingWork();
		return response.body.submissionId;
	};

	before(async () => {
		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);

			// The staging functions are not awaited by the services that call them; track their promises so tests
			// can wait for them to finish
			const originalAddFiles = processor.addFilesToSubmissionAsync;
			processor.addFilesToSubmissionAsync = (...args) => trackPendingWork(originalAddFiles(...args));
			const originalInsertRecords = processor.processInsertRecordsAsync;
			processor.processInsertRecordsAsync = (...args) => trackPendingWork(originalInsertRecords(...args));
			const originalEditRecords = processor.processEditRecordsAsync;
			processor.processEditRecordsAsync = (...args) => trackPendingWork(originalEditRecords(...args));
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);

		// Services call the worker pool through the shared dependencies object, so replacing its functions here
		// intercepts every validation and commit job
		workerPool = lyricProvider.configs.workerPool;
		originalDataValidation = workerPool.dataValidation;
		originalCommitSubmission = workerPool.commitSubmission;
		workerPool.dataValidation = (input) => {
			validationJobs.push(input);
			if (!runValidationJobs) {
				return Promise.resolve();
			}
			return trackPendingWork(originalDataValidation(input));
		};
		workerPool.commitSubmission = (input) => {
			commitJobs.push(input);
			return trackPendingWork(originalCommitSubmission(input));
		};
	});

	beforeEach(async () => {
		runValidationJobs = false;
		validationJobs = [];
		commitJobs = [];
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

	describe('Staging changes', () => {
		it('should set status OPEN and increment the version when JSON records are submitted', async () => {
			const submissionId = await submitSportRecords([{ sport_id: '1', name: 'Soccer' }]);

			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(1);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 1 }]);
			expect(await getRecordStates(submissionId)).to.eql(['RECEIVED']);

			await submitSportRecords([{ sport_id: '2', name: 'Hockey' }]);

			const updatedSubmission = await getSubmission(submissionId);
			expect(updatedSubmission.status).to.equal('OPEN');
			expect(updatedSubmission.version).to.equal(2);
			expect(validationJobs.map((job) => job.version)).to.eql([1, 2]);
		});

		it('should stage records of every entity in a single version', async () => {
			const submissionId = await createSubmission({ status: 'OPEN' });
			const processor = originalCreate(lyricProvider.configs);
			const activeDictionary = await lyricProvider.repositories.category.getActiveDictionaryByCategory(categoryId);
			assertExists(activeDictionary);

			await processor.processInsertRecordsAsync({
				records: {
					sport: [{ sport_id: '1', name: 'Soccer' }],
					team: [{ team_id: '1', sport_id: '1', name: 'Team A' }],
				},
				schemasDictionary: {
					name: activeDictionary.name,
					version: activeDictionary.version,
					schemas: activeDictionary.schemas,
				},
				submissionId,
				username: '',
			});

			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(1);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 1 }]);
			expect(await getRecordStates(submissionId)).to.eql(['RECEIVED', 'RECEIVED']);
		});

		it('should set status OPEN and increment the version when files are submitted', async () => {
			const submissionId = await createSubmission({ status: 'VALID', version: 3 });
			const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=${ORGANIZATION}`)
				.attach('files', sportTsv, 'sport.tsv');
			await waitForPendingWork();

			expect(response.body.submissionId).to.equal(submissionId);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(4);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 4 }]);
		});

		it('should set status OPEN and increment the version when a record is removed from the submission', async () => {
			const submissionId = await createSubmission({ status: 'VALID', version: 1 });
			const [recordId] = await saveSportRecords({ submissionId, states: ['VALID', 'VALID'] });

			const response = await app.delete(`/${submissionId}/data?recordId=${recordId}`);

			expect(response.status).to.equal(200);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(2);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 2 }]);
			expect(await getRecordStates(submissionId)).to.eql(['VALID']);
		});

		it('should set status OPEN and increment the version when submitted data is staged for deletion', async () => {
			const submissionId = await createSubmission({ status: 'INVALID', version: 1 });
			await lyricProvider.repositories.submittedData.save({
				data: { sport_id: '1', name: 'Soccer' },
				dictionaryCategoryId: categoryId,
				entityName: 'sport',
				isValid: true,
				organization: ORGANIZATION,
				originalSchemaId: dictionaryId,
				systemId: 'SPORT1',
			});

			const response = await app.delete(`/category/${categoryId}/data/SPORT1`);

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PROCESSING');
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(2);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 2 }]);
		});

		it('should set status OPEN and increment the version when submitted data is edited', async () => {
			const submissionId = await createSubmission({ status: 'VALID', version: 1 });
			await lyricProvider.repositories.submittedData.save({
				data: { sport_id: '1', name: 'Soccer' },
				dictionaryCategoryId: categoryId,
				entityName: 'sport',
				isValid: true,
				organization: ORGANIZATION,
				originalSchemaId: dictionaryId,
				systemId: 'SPORT1',
			});

			const response = await app
				.put(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
				.send([{ systemId: 'SPORT1', sport_id: '1', name: 'Football' }]);
			await waitForPendingWork();

			expect(response.status).to.equal(200);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(2);
			expect(validationJobs).to.eql([{ submissionId, username: '', version: 2 }]);
		});
	});

	describe('Staging into a submission that is validating or committing', () => {
		it('should reject JSON records when the active submission is VALIDATING', async () => {
			const submissionId = await createSubmission({ status: 'VALIDATING', version: 1 });

			const response = await app
				.post(`/category/${categoryId}/data?entityName=sport&organization=${ORGANIZATION}`)
				.send([{ sport_id: '1', name: 'Soccer' }]);
			await waitForPendingWork();

			expect(response.body).to.have.property('status', 'INVALID_SUBMISSION');
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('VALIDATING');
			expect(submission.version).to.equal(1);
			expect(await getRecordStates(submissionId)).to.eql([]);
			expect(validationJobs).to.eql([]);
		});

		for (const status of ['VALIDATING', 'COMMITTING'] as const) {
			it(`should not stage records when the status changed to ${status} after the request was accepted`, async () => {
				const submissionId = await createSubmission({ status, version: 1 });
				const processor = originalCreate(lyricProvider.configs);
				const activeDictionary = await lyricProvider.repositories.category.getActiveDictionaryByCategory(categoryId);
				assertExists(activeDictionary);

				await processor.processInsertRecordsAsync({
					records: { sport: [{ sport_id: '1', name: 'Soccer' }] },
					schemasDictionary: {
						name: activeDictionary.name,
						version: activeDictionary.version,
						schemas: activeDictionary.schemas,
					},
					submissionId,
					username: '',
				});

				const submission = await getSubmission(submissionId);
				expect(submission.status).to.equal(status);
				expect(submission.version).to.equal(1);
				expect(await getRecordStates(submissionId)).to.eql([]);
				expect(validationJobs).to.eql([]);
			});

			it(`should roll back staging and throw StatusConflict when the submission is ${status}`, async () => {
				const submissionId = await createSubmission({ status, version: 1 });
				const processor = originalCreate(lyricProvider.configs);

				let thrownError: unknown;
				try {
					await lyricProvider.configs.db.transaction(async (transaction) => {
						await processor.markSubmissionAsChanged(submissionId, '', transaction);
					});
				} catch (error) {
					thrownError = error;
				}

				expect(thrownError).to.be.instanceOf(StatusConflict);
				const submission = await getSubmission(submissionId);
				expect(submission.status).to.equal(status);
				expect(submission.version).to.equal(1);
			});
		}

		it('should reject removing a record when the submission is COMMITTING', async () => {
			const submissionId = await createSubmission({ status: 'COMMITTING', version: 1 });
			const [recordId] = await saveSportRecords({ submissionId, states: ['VALID'] });

			const response = await app.delete(`/${submissionId}/data?recordId=${recordId}`);

			expect(response.status).to.equal(409);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('COMMITTING');
			expect(submission.version).to.equal(1);
			expect(await getRecordStates(submissionId)).to.eql(['VALID']);
			expect(validationJobs).to.eql([]);
		});
	});

	describe('Validation jobs', () => {
		it('should do nothing when a validation job carries an outdated version', async () => {
			const submissionId = await submitSportRecords([{ sport_id: '1', name: 'Soccer' }]);
			await submitSportRecords([{ sport_id: '2', name: 'Hockey' }]);
			const processor = originalCreate(lyricProvider.configs);

			const outdatedResult = await processor.performDataValidation(submissionId, '', 1);

			expect(outdatedResult).to.be.undefined;
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(submission.version).to.equal(2);
			expect(await getRecordStates(submissionId)).to.eql(['RECEIVED', 'RECEIVED']);

			const currentResult = await processor.performDataValidation(submissionId, '', 2);

			expect(currentResult).to.equal(submissionId);
			const validatedSubmission = await getSubmission(submissionId);
			expect(validatedSubmission.status).to.equal('VALID');
			expect(validatedSubmission.version).to.equal(2);
			expect(await getRecordStates(submissionId)).to.eql(['VALID', 'VALID']);
		});

		it('should run only the validation job of the latest version when jobs for several versions are queued', async () => {
			const submissionId = await submitSportRecords([{ sport_id: '1', name: 'Soccer' }]);
			await submitSportRecords([{ sport_id: '2', name: 'Hockey' }]);
			const processor = originalCreate(lyricProvider.configs);

			const results = await Promise.all(
				validationJobs.map((job) => processor.performDataValidation(job.submissionId, job.username, job.version)),
			);

			expect(results).to.eql([undefined, submissionId]);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('VALID');
			expect(await getRecordStates(submissionId)).to.eql(['VALID', 'VALID']);
		});

		it('should discard a validation result when the version changed during validation', async () => {
			const submissionId = await createSubmission({ status: 'VALIDATING', version: 2 });
			const recordIds = await saveSportRecords({ submissionId, states: ['RECEIVED'] });
			const processor = originalCreate(lyricProvider.configs);

			const result = await processor.updateActiveSubmission({
				dictionaryId,
				idActiveSubmission: submissionId,
				schemaErrors: {},
				validatedRecordIds: recordIds,
				version: 1,
			});

			expect(result).to.be.undefined;
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('VALIDATING');
			expect(submission.version).to.equal(2);
			expect(await getRecordStates(submissionId)).to.eql(['RECEIVED']);
		});

		it('should discard a validation result when the submission is no longer VALIDATING', async () => {
			const submissionId = await createSubmission({ status: 'CLOSED', version: 1 });
			const recordIds = await saveSportRecords({ submissionId, states: ['RECEIVED'] });
			const processor = originalCreate(lyricProvider.configs);

			const result = await processor.updateActiveSubmission({
				dictionaryId,
				idActiveSubmission: submissionId,
				schemaErrors: {},
				validatedRecordIds: recordIds,
				version: 1,
			});

			expect(result).to.be.undefined;
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('CLOSED');
			expect(await getRecordStates(submissionId)).to.eql(['RECEIVED']);
		});
	});

	describe('Commit', () => {
		it('should refuse to commit while the submission status is OPEN after staging', async () => {
			const submissionId = await submitSportRecords([{ sport_id: '1', name: 'Soccer' }]);

			const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);

			expect(response.status).to.equal(409);
			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('OPEN');
			expect(commitJobs).to.eql([]);
		});

		for (const notValidState of ['RECEIVED', 'INVALID'] as const) {
			it(`should refuse to commit a VALID submission with a record in state ${notValidState}`, async () => {
				const submissionId = await createSubmission({ status: 'VALID', version: 1 });
				await saveSportRecords({ submissionId, states: ['VALID', notValidState] });

				const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);

				expect(response.status).to.equal(409);
				const submission = await getSubmission(submissionId);
				expect(submission.status).to.equal('VALID');
				expect(submission.version).to.equal(1);
				expect(commitJobs).to.eql([]);
			});
		}

		it('should commit a VALID submission whose records are all VALID, carrying its version to the commit job', async () => {
			runValidationJobs = true;
			const submissionId = await submitSportRecords([{ sport_id: '1', name: 'Soccer' }]);

			const validatedSubmission = await getSubmission(submissionId);
			expect(validatedSubmission.status).to.equal('VALID');
			expect(await getRecordStates(submissionId)).to.eql(['VALID']);

			const response = await app.post(`/category/${categoryId}/commit/${submissionId}`);
			await waitForPendingWork();

			expect(response.status).to.equal(200);
			expect(commitJobs).to.eql([{ submissionId, username: '', version: 1 }]);
			const committedSubmission = await getSubmission(submissionId);
			expect(committedSubmission.status).to.equal('COMMITTED');

			const submittedData = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				ORGANIZATION,
			);
			expect(submittedData.map((record) => record.data)).to.eql([{ sport_id: '1', name: 'Soccer' }]);
		});

		it('should not commit when the commit job carries an outdated version', async () => {
			const submissionId = await createSubmission({ status: 'COMMITTING', version: 2 });
			await saveSportRecords({ submissionId, states: ['VALID'] });

			await workerPool.commitSubmission({ submissionId, username: '', version: 1 });
			await waitForPendingWork();

			const submission = await getSubmission(submissionId);
			expect(submission.status).to.equal('COMMITTING');
			const submittedData = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				ORGANIZATION,
			);
			expect(submittedData).to.eql([]);
		});
	});
});
