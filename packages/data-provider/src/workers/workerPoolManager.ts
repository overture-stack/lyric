import { fileURLToPath } from 'node:url';

import * as workerpool from 'workerpool';

import type { AppConfig } from '../config/config.js';
import { getLogger } from '../config/logger.js';
import type { CommitWorkerInput, DataValidationWorkerInput, WorkerFunctions, WorkerProxy } from './types.js';

const LOG_MODULE = 'WORKER_POOL_MANAGER';

/**
 * Most workers the pool runs at the same time when `AppConfig.workerPool.maxWorkers` is not set.
 * Fixed rather than derived from the CPU count: workerpool's own default counts every CPU of the machine,
 * which inside a container is the whole node, not the container's CPU limit.
 */
export const DEFAULT_MAX_WORKERS = 1;

/**
 * Resolves the most workers the pool may run, from the application configuration first,
 * then from the resolver's pool options, then `DEFAULT_MAX_WORKERS`.
 * @throws when the resolved value is not an integer of at least 1
 */
export const resolveMaxWorkers = (configData: AppConfig, poolOptions: WorkerPoolConfig['poolOptions']): number => {
	const maxWorkers = configData.workerPool?.maxWorkers ?? poolOptions?.maxWorkers ?? DEFAULT_MAX_WORKERS;
	if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
		throw new Error(`Worker pool 'maxWorkers' must be an integer of at least 1. Received ${maxWorkers}`);
	}
	return maxWorkers;
};

/**
 * Worker pool configuration values used to initialize `workerpool.pool`.
 */
export type WorkerPoolConfig = {
	/** Absolute path to the worker entry file. */
	workerPath: string;
	/** Optional worker pool runtime options. */
	poolOptions?: Parameters<typeof workerpool.pool>[1];
};

/**
 * Resolves worker pool configuration at runtime.
 */
export type WorkerPoolConfigResolver = () => WorkerPoolConfig;

/**
 * Optional overrides used when creating a worker pool.
 */
export type CreateWorkerPoolOptions = {
	/** Custom resolver, primarily used by tests to inject worker settings. */
	resolveWorkerPoolConfig?: WorkerPoolConfigResolver;
};

/**
 * Default worker pool configuration resolver.
 *
 * Uses the built JavaScript worker entry file generated at build time.
 */
const defaultWorkerPoolConfigResolver: WorkerPoolConfigResolver = () => ({
	workerPath: fileURLToPath(new URL('./workerpool.js', import.meta.url)),
});

/**
 * Factory function to create a worker pool with the given configuration.
 * @param configData The application configuration
 * @param options Optional worker pool customization (used by tests to inject TS workers).
 * @returns The worker functions to execute tasks in the worker pool
 */
export const createWorkerPool = (configData: AppConfig, options?: CreateWorkerPoolOptions): WorkerFunctions => {
	const logger = getLogger(configData.logger);

	// Initialize worker pool
	const resolveWorkerPoolConfig = options?.resolveWorkerPoolConfig ?? defaultWorkerPoolConfigResolver;
	const { workerPath, poolOptions } = resolveWorkerPoolConfig();
	const maxWorkers = resolveMaxWorkers(configData, poolOptions);
	const pool = workerpool.pool(workerPath, { ...poolOptions, maxWorkers });
	logger.info(LOG_MODULE, `Worker pool created with up to ${maxWorkers} worker(s)`);

	// Cannot send non serializable objects/functions to worker, so we need to create a config object without those properties
	const workerConfig: AppConfig = {
		...configData,
		auth: {
			...configData.auth,
			customAuthHandler: undefined,
		},
		onFinishCommit: undefined,
	};

	// Create a typed proxy, then initialize a worker through it.
	// This reaches only one worker, so it serves to fail fast at startup on a bad configuration.
	// Every task below also passes workerConfig, so a worker the pool starts later initializes itself on its first task.
	const readyProxy = pool
		.proxy<WorkerProxy>()
		.then(async (proxy) => {
			await proxy.verifyWorkerInitialization(workerConfig);
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
				const resultCommit = await proxy.commitSubmission(input, workerConfig);

				// Awaited intentionally: the caller fires commitSubmission without await and returns PROCESSING
				// to the client immediately, so this does not block the HTTP response. Awaiting here ensures
				// the publish completes before the worker task is considered complete.
				// onFinishCommit catches its own errors and never rethrows.
				if (configData.onFinishCommit && resultCommit) {
					await configData.onFinishCommit(resultCommit);
				}
			} catch (error) {
				const errMessage = error instanceof Error ? error.message : String(error);
				logger.error(LOG_MODULE, `Worker pool execution failed for commitSubmission: ${errMessage}`);
				// Do not re-throw error since commitSubmission in the worker is designed to not throw errors, but log them instead.
				// This ensures the main thread is not affected by worker errors and can continue processing other tasks.
			}
		},
		dataValidation: async (input: DataValidationWorkerInput): Promise<void> => {
			const proxy = await readyProxy; // wait for worker to initialize before using
			try {
				await proxy.dataValidation(input, workerConfig);
			} catch (error) {
				const errMessage = error instanceof Error ? error.message : String(error);
				logger.error(LOG_MODULE, `Worker pool execution failed for dataValidation: ${errMessage}`);
				// Do not re-throw error since dataValidation in the worker is designed to not throw errors, but log them instead.
				// This ensures the main thread is not affected by worker errors and can continue processing other tasks.
			}
		},
		dictionaryMigration: async (input) => {
			const proxy = await readyProxy; // wait for worker to initialize before using
			try {
				await proxy.dictionaryMigration(input, workerConfig);
			} catch (error) {
				const errMessage = error instanceof Error ? error.message : String(error);
				logger.error(LOG_MODULE, `Worker pool execution failed for dictionaryMigration: ${errMessage}`);
				// Do not re-throw error since dictionaryMigration in the worker is designed to not throw errors, but log them instead.
				// This ensures the main thread is not affected by worker errors and can continue processing other tasks.
			}
		},
		terminate: async (): Promise<void> => {
			await pool.terminate();
		},
	};
};
