import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as workerpool from 'workerpool';

import type { AppConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import type { CommitWorkerInput, DataValidationWorkerInput, WorkerFunctions } from './types.js';

const LOG_MODULE = 'WORKER_POOL_MANAGER';

/**
 * Factory function to create a worker pool with the given configuration.
 * @param configData The application configuration
 * @returns The worker functions to execute tasks in the worker pool
 */
export const createWorkerPool = (configData: AppConfig): WorkerFunctions => {
	const logger = getLogger(configData.logger);

	// Initialize worker pool
	const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'workerpool.js');
	const pool = workerpool.pool(workerPath);

	logger.info(LOG_MODULE, 'Initializing worker pool...');

	// Cannot send non serializable objects/functions to worker, so we need to create a config object without those properties
	const workerConfig: AppConfig = {
		...configData,
		auth: {
			...configData.auth,
			customAuthHandler: undefined,
		},
		onFinishCommit: undefined,
	};

	pool
		.exec('initializeWorker', [workerConfig])
		.then(() => {
			logger.info(LOG_MODULE, 'Worker pool initialized successfully');
		})
		.catch((error) => {
			const errMessage = error instanceof Error ? error.message : error;
			logger.error(LOG_MODULE, `Worker pool initialization failed during execution: ${errMessage}`);
		});

	const commitSubmission = async (input: CommitWorkerInput) => {
		try {
			const resultCommit = await pool.exec('commitSubmission', [input]);

			if (configData.onFinishCommit && resultCommit) {
				configData.onFinishCommit(resultCommit);
			}
		} catch (error) {
			const errMessage = error instanceof Error ? error.message : error;
			logger.error(LOG_MODULE, `Worker pool execution failed for commitSubmission: ${errMessage}`);
		}
	};

	const dataValidation = async (input: DataValidationWorkerInput) => {
		try {
			const resultValidation = await pool.exec('performDataValidation', [input]);

			return resultValidation;
		} catch (error) {
			const errMessage = error instanceof Error ? error.message : error;
			logger.error(LOG_MODULE, `Worker pool execution failed for dataValidation: ${errMessage}`);

			// TODO: If worker thread fails unexpectedly
			// Should we update the submission to failed status?
		}
	};

	return { commitSubmission, dataValidation };
};
