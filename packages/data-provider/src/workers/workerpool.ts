import * as workerpool from 'workerpool';

import type { AppConfig, ResultOnCommit } from '../../index.js';
import { processCommitSubmission } from './commitSubmissionWorker.js';
import { processDataValidation } from './dataValidationWorker.js';
import { performDictionaryMigration } from './dictionaryMigrationWorker.js';
import type {
	CommitWorkerInput,
	DataValidationWorkerInput,
	DictionaryMigrationWorkerInput,
	WorkerProxy,
} from './types.js';
import { initializeWorkerContext } from './workerContext.js';

// Initialization promise for this worker, shared by every task it runs.
let initializeWorkerPromise: Promise<void> | undefined;

/**
 * Initializes this worker's context on first use, and waits for that same initialization on every later call.
 *
 * The pool starts workers on demand and replaces any that exit, so a task can land on a worker that has
 * never been initialized. Every task therefore carries the configuration and initializes its worker
 * if needed, rather than relying on a single initialization call made when the pool starts.
 * A failed initialization is cleared so the next task can try again.
 * @param appConfig The serializable application configuration
 */
const ensureWorkerInitialized = (appConfig: AppConfig): Promise<void> => {
	if (!initializeWorkerPromise) {
		initializeWorkerPromise = initializeWorkerContext(appConfig).catch((error) => {
			initializeWorkerPromise = undefined;
			throw error;
		});
	}
	return initializeWorkerPromise;
};

// Export only registered functions on the worker via a proxy
const workerProxy: WorkerProxy = {
	verifyWorkerInitialization: async (appConfig: AppConfig): Promise<void> => {
		await ensureWorkerInitialized(appConfig);
	},
	commitSubmission: async (input: CommitWorkerInput, appConfig: AppConfig): Promise<ResultOnCommit> => {
		await ensureWorkerInitialized(appConfig);
		const result = await processCommitSubmission(input);
		// TODO: Consider sending result back to main thread in chuncks
		// workerpool.workerEmit({ type: 'chunk', chunk: { type: 'commitResult', result } });
		return result;
	},
	dataValidation: async (input: DataValidationWorkerInput, appConfig: AppConfig): Promise<number> => {
		await ensureWorkerInitialized(appConfig);
		return await processDataValidation(input);
	},
	dictionaryMigration: async (input: DictionaryMigrationWorkerInput, appConfig: AppConfig): Promise<void> => {
		await ensureWorkerInitialized(appConfig);
		return await performDictionaryMigration(input);
	},
};

workerpool.worker(workerProxy);
