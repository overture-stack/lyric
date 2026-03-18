import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as workerpool from 'workerpool';

import type { AppConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import type { CommitWorkerInput, WorkerFunctions, WorkerProxy } from './types.js';

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

	// Cannot send non serializable objects/functions to worker, so we need to create a config object without those properties
	const workerConfig: AppConfig = {
		...configData,
		auth: {
			...configData.auth,
			customAuthHandler: undefined,
		},
		onFinishCommit: undefined,
	};

	// Create a typed proxy, then initialize the worker through it.
	// Storing the resulting promise allows commitSubmission to await readiness,
	// preventing a race where commits run before the worker context is ready.
	const readyProxy = pool
		.proxy<WorkerProxy>()
		.then(async (proxy) => {
			await proxy.initializeWorker(workerConfig);
			logger.info(LOG_MODULE, 'Worker pool initialized successfully');
			return proxy;
		})
		.catch((error) => {
			const errMessage = error instanceof Error ? error.message : String(error);
			logger.error(LOG_MODULE, `Worker pool initialization failed: ${errMessage}`);

			// this is needed to ensure the error is thrown and propagated immediately during startup,
			// application should not start if worker initialization fails.
			queueMicrotask(() => {
				if (error instanceof Error) {
					throw error;
				}
				throw new Error(errMessage);
			});

			throw error;
		});

	return {
		commitSubmission: async (input: CommitWorkerInput): Promise<void> => {
			const proxy = await readyProxy; // wait for worker to initialize before using
			try {
				const resultCommit = await proxy.commitSubmission(input);

				if (configData.onFinishCommit && resultCommit) {
					configData.onFinishCommit(resultCommit);
				}
			} catch (error) {
				const errMessage = error instanceof Error ? error.message : String(error);
				logger.error(LOG_MODULE, `Worker pool execution failed for commitSubmission: ${errMessage}`);
			}
		},
		terminate: async (): Promise<void> => {
			await pool.terminate();
			logger.info(LOG_MODULE, 'Worker pool terminated');
		},
	};
};
