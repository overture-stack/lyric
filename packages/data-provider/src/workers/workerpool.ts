import * as workerpool from 'workerpool';

import type { AppConfig, ResultOnCommit } from '../../index.js';
import { processCommitSubmission } from './commitSubmissionWorker.js';
import type { CommitWorkerInput, WorkerProxy } from './types.js';
import { initializeWorkerContext } from './workerContext.js';

// Store initialization promise once it has been initiated.
let initializeWorkerPromise: Promise<void> | undefined;

// Export only registered functions on the worker via a proxy
const workerProxy: WorkerProxy = {
	initializeWorker: async (appConfig: AppConfig): Promise<void> => {
		if (!initializeWorkerPromise) {
			initializeWorkerPromise = initializeWorkerContext(appConfig);
		}
		return await initializeWorkerPromise;
	},
	commitSubmission: async (input: CommitWorkerInput): Promise<ResultOnCommit> => {
		if (!initializeWorkerPromise) {
			throw new Error('Worker not initialized. Make sure initializeWorker is called first.');
		}
		// This avoids processing commit submissions before the worker is fully initialized
		await initializeWorkerPromise;
		const result = await processCommitSubmission(input);
		// TODO: Consider sending result back to main thread in chuncks
		// workerpool.workerEmit({ type: 'chunk', chunk: { type: 'commitResult', result } });
		return result;
	},
};

workerpool.worker(workerProxy);
