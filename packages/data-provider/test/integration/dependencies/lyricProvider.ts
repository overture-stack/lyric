import { fileURLToPath } from 'node:url';

import { type DbConfig, migrate } from '@overture-stack/lyric-data-model';

import type {
	AppConfig,
	FeaturesConfig,
	IdServiceConfig,
	LoggerConfig,
	SchemaServiceConfig,
	SubmissionServiceConfig,
	ValidatorConfig,
	WorkerPoolSettings,
} from '../../../src/config/config.js';
import provider from '../../../src/core/provider.js';
import type { AuthConfig } from '../../../src/middleware/auth.js';
import type { WorkerPoolConfigResolver } from '../../../src/workers/workerPoolManager.js';

export type LyricProviderConfig = {
	auth?: AuthConfig;
	db: DbConfig;
	schemaService: SchemaServiceConfig;
	features?: FeaturesConfig;
	idService?: IdServiceConfig;
	logger?: LoggerConfig;
	onFinishCommit?: AppConfig['onFinishCommit'];
	submissionService?: SubmissionServiceConfig;
	validator?: ValidatorConfig;
	workerPool?: WorkerPoolSettings;
};

export type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

const defaultSubmissionService: SubmissionServiceConfig = {
	maxFileSize: 10 * 1024 * 1024, // 10 MB
};

const defaultFeatures: FeaturesConfig = {
	recordHierarchy: { pluralizeSchemasName: false },
};

const defaultIdService: IdServiceConfig = {
	useLocal: true,
	customAlphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	customSize: 21,
};

/**
 * Worker pool configuration resolver used for testing.
 * It points to the TypeScript worker entry file.
 */
const testWorkerPoolConfigResolver: WorkerPoolConfigResolver = () => ({
	workerPath: fileURLToPath(new URL('../../../src/workers/workerpool.ts', import.meta.url)),
	poolOptions: {
		workerType: 'process',
		forkOpts: {
			execArgv: ['--import=tsx'],
		},
	},
});

export async function createLyricProvider(config: LyricProviderConfig) {
	await migrate(config.db);

	const appConfig: AppConfig = {
		auth: config.auth ?? { enabled: false },
		db: config.db,
		schemaService: config.schemaService,
		features: config.features ?? defaultFeatures,
		idService: config.idService ?? defaultIdService,
		logger: config.logger ?? { level: 'silent' },
		onFinishCommit: config.onFinishCommit,
		submissionService: config.submissionService ?? defaultSubmissionService,
		validator: config.validator ?? [],
		workerPool: config.workerPool,
	};

	return provider(appConfig, {
		workerPoolConfigResolver: testWorkerPoolConfigResolver,
	});
}
