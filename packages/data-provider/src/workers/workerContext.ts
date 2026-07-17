import type { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import type { WorkerContext } from './types.js';

let workerContext: WorkerContext | undefined;

/**
 * Returns whether the worker context has been initialized.
 */
export const isInitialized = (): boolean => workerContext !== undefined;

/**
 * Initialize the worker context with AppConfig.
 * This is idempotent: if the context is already initialized it returns without making changes.
 * The context is a global singleton and cannot be modified after initialization.
 * @param configData - The application configuration
 */
export const initializeWorkerContext = async (configData: AppConfig): Promise<void> => {
	if (isInitialized()) {
		return;
	}

	// The Worker needs it's own database connection
	const baseDeps: BaseDependencies = {
		db: connect(configData.db),
		features: configData.features,
		idService: configData.idService,
		logger: getLogger(configData.logger),
		schemaService: configData.schemaService,
		submissionService: configData.submissionService,
		onFinishCommit: configData.onFinishCommit,
		workerPool: {
			commitSubmission: async () => {
				throw new Error('Worker pool functions cannot be called from within the worker');
			},
			dataValidation: async () => {
				throw new Error('Worker pool functions cannot be called from within the worker');
			},
			dictionaryMigration: async () => {
				throw new Error('Worker pool functions cannot be called from within the worker');
			},
			terminate: async () => {
				throw new Error('Worker pool functions cannot be called from within the worker');
			},
		},
	};

	workerContext = {
		dependencies: baseDeps,
	};
};

/**
 * Utility function to get dependencies directly from the context
 * @returns The BaseDependencies object
 */
export const getWorkerDependencies = (): Omit<BaseDependencies, 'onFinishCommit' | 'getWorkerPool'> => {
	if (!workerContext) {
		throw new Error('Worker context is not initialized. Call initializeWorkerContext first.');
	}
	return workerContext.dependencies;
};
