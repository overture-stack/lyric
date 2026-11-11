import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect, getConnectionPool } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import auditController from '../controllers/auditController.js';
import categoryController from '../controllers/categoryController.js';
import dictionaryController from '../controllers/dictionaryController.js';
import migrationController from '../controllers/migrationController.js';
import submissionController from '../controllers/submissionController.js';
import submittedDataController from '../controllers/submittedDataController.js';
import validationController from '../controllers/validationController.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import auditRepository from '../repository/auditRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import migrationRepository from '../repository/dictionaryMigrationRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import { createRouters } from '../routers/createRouters.js';
import auditService from '../services/auditService.js';
import categoryService from '../services/categoryService.js';
import dictionaryService from '../services/dictionaryService.js';
import migrationService from '../services/migrationService.js';
import submissionService from '../services/submission/submissionService.js';
import submittedDataService from '../services/submittedData/submmittedData.js';
import validationService from '../services/validationService.js';
import * as auditUtils from '../utils/auditUtils.js';
import * as convertSqonToQueryUtils from '../utils/convertSqonToQuery.js';
import * as dictionarySchemaRelationUtils from '../utils/dictionarySchemaRelations.js';
import * as dictionaryUtils from '../utils/dictionaryUtils.js';
import * as errorUtils from '../utils/errors.js';
import * as schemaUtils from '../utils/schemas.js';
import * as submissionUtils from '../utils/submissionUtils.js';
import * as submittedDataUtils from '../utils/submittedDataUtils.js';
import * as typeUtils from '../utils/types.js';
import { createWorkerPool, type WorkerPoolConfigResolver } from '../workers/workerPoolManager.js';

export type ProviderOptions = {
	workerPoolConfigResolver?: WorkerPoolConfigResolver;
};

/**
 * The main provider of submission resources
 * @param configData Environment variables required to configure resources
 * @param options Optional provider-level overrides (mainly for test wiring)
 * @returns A provider to get access to resources
 */
const provider = (configData: AppConfig, options?: ProviderOptions) => {
	const baseDeps: BaseDependencies = {
		db: connect(configData.db),
		features: configData.features,
		idService: configData.idService,
		logger: getLogger(configData.logger),
		schemaService: configData.schemaService,
		submissionService: configData.submissionService,
		onFinishCommit: configData.onFinishCommit,
		workerPool: createWorkerPool(configData, {
			resolveWorkerPoolConfig: options?.workerPoolConfigResolver,
		}),
	};

	return {
		configs: baseDeps,
		routers: createRouters({
			authConfig: configData.auth,
			baseDependencies: baseDeps,
			validatorConfig: configData.validator,
		}),
		controllers: {
			audit: auditController(baseDeps),
			category: categoryController({
				authConfig: { enabled: configData.auth.enabled },
				baseDependencies: baseDeps,
			}),
			dictionary: dictionaryController({
				authConfig: { enabled: configData.auth.enabled },
				baseDependencies: baseDeps,
			}),
			migration: migrationController(baseDeps),
			submission: submissionController({
				baseDependencies: baseDeps,
				authConfig: { enabled: configData.auth.enabled },
			}),
			submittedData: submittedDataController({ baseDependencies: baseDeps, authConfig: configData.auth }),
			validator: validationController({ baseDependencies: baseDeps, validatorConfig: configData.validator }),
		},
		services: {
			audit: auditService(baseDeps),
			category: categoryService(baseDeps),
			dictionary: dictionaryService(baseDeps),
			migration: migrationService(baseDeps),
			submission: submissionService(baseDeps),
			submittedData: submittedDataService(baseDeps),
			validation: validationService(baseDeps),
		},
		repositories: {
			audit: auditRepository(baseDeps),
			category: categoryRepository(baseDeps),
			dictionary: dictionaryRepository(baseDeps),
			migration: migrationRepository(baseDeps),
			submission: submissionRepository(baseDeps),
			submittedData: submittedDataRepository(baseDeps),
		},
		utils: {
			audit: auditUtils,
			convertSqonToQuery: convertSqonToQueryUtils,
			dictionarySchemaRelations: dictionarySchemaRelationUtils,
			dictionary: dictionaryUtils,
			errors: errorUtils,
			schema: schemaUtils,
			submission: submissionUtils,
			submittedData: submittedDataUtils,
			type: typeUtils,
		},
		/**
		 * Shuts down the worker pool. Call this on application termination to cleanly
		 * terminate any running worker threads.
		 *
		 * @example
		 * process.on('SIGTERM', async () => {
		 *   await lyric.shutdown();
		 *   process.exit(0);
		 * });
		 */
		shutdown: async () => {
			await getConnectionPool(baseDeps.db)?.end();
			await baseDeps.workerPool.terminate();
		},
	};
};

export default provider;
