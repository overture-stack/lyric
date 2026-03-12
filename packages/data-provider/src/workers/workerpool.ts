import * as workerpool from 'workerpool';

import type { AppConfig, ResultOnCommit } from '../../index.js';
import { processCommitSubmission } from './commitSubmissionWorker.js';
import { processDataValidation } from './dataValidationWorker.js';
import type { CommitWorkerInput, DataValidationWorkerInput } from './types.js';
import { initializeWorkerContext } from './workerContext.js';

// Initialize worker context when the worker starts
let isInitialized = false;

export const initializeWorker = async (appConfig: AppConfig): Promise<void> => {
	if (!isInitialized) {
		await initializeWorkerContext(appConfig);
		isInitialized = true;
	}
};

export const commitSubmission = async (input: CommitWorkerInput): Promise<ResultOnCommit | undefined> => {
	if (!isInitialized) {
		throw new Error('Worker not initialized. Call initializeWorker first.');
	}
	const result = await processCommitSubmission(input);
	// TODO: Consider sending result back to main thread in chuncks
	// workerpool.workerEmit({ type: 'chunk', chunk: { type: 'commitResult', result } });
	return result;
};

export const performDataValidation = async (input: DataValidationWorkerInput): Promise<number> => {
	if (!isInitialized) {
		throw new Error('Worker not initialized. Call initializeWorker first.');
	}
	return await processDataValidation(input);
};

// Export functions for workerpool
workerpool.worker({
	initializeWorker,
	commitSubmission,
	performDataValidation,
});
