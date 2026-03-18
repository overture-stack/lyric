import type { ResultOnCommit } from '../../index.js';
import type { AppConfig, BaseDependencies } from '../config/config.js';

export type CommitWorkerInput = {
	submissionId: number;
	username: string;
};

export type WorkerContext = {
	dependencies: BaseDependencies;
};

/**
 * Defines the functions that are exposed through the Lyric provider.
 * This works as a wrapper around the WorkerProxy functions
 */
export type WorkerFunctions = {
	/**
	 * Uses a worker thread from the pool to execute the commit submission process.
	 * Then, the onFinishCommit callback is executed in the main thread since functions cannot be passed to workers
	 * @param input The input data for the commit submission
	 * @returns A void promise that resolves when the onFinishCommit callback is executed in the main thread after processing the commit submission in the worker thread
	 */
	commitSubmission(input: CommitWorkerInput): Promise<void>;

	/**
	 * Terminates the worker pool and all its workers
	 * @returns A void promise that resolves when the pool is terminated
	 */
	terminate(): Promise<void>;
};

/**
 * Defines the functions that the worker thread exposes to the main thread through the worker pool proxy.
 * These functions must be serializable and cannot include functions (e.g., database connections, logger instances, etc.)
 * since they will be executed in a separate thread.
 */
export type WorkerProxy = {
	/**
	 * Initializes the worker context with the provided application configuration.
	 * @param appConfig The application configuration
	 * @returns A void promise that resolves when the worker context is initialized
	 */
	initializeWorker: (appConfig: AppConfig) => Promise<void>;
	/**
	 * * This function is executed in the worker thread to start processing the commit submission logic.
	 * Since this runs in a worker, we cannot execute the onFinishCommit callback here,
	 * instead we return the result and execute it in the main thread.
	 * @param input The input data for the commit submission
	 * @returns A promise that resolves with the result of the commit submission process
	 */
	commitSubmission: (input: CommitWorkerInput) => Promise<ResultOnCommit>;
};
