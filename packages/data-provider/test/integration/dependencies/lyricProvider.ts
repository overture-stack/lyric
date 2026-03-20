import { type DbConfig, migrate } from '@overture-stack/lyric-data-model';

import type {
	AppConfig,
	FeaturesConfig,
	IdServiceConfig,
	LoggerConfig,
	SchemaServiceConfig,
	SubmissionServiceConfig,
	ValidatorConfig,
} from '../../../src/config/config.js';
import { getConnectionPool } from '../../../src/config/db.js';
import provider from '../../../src/core/provider.js';

export type LyricProviderConfig = {
	db: DbConfig;
	schemaService: SchemaServiceConfig;
	features?: FeaturesConfig;
	idService?: IdServiceConfig;
	logger?: LoggerConfig;
	submissionService?: SubmissionServiceConfig;
	validator?: ValidatorConfig;
};

export type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

const DEFAULT_SUBMISSION_SERVICE: SubmissionServiceConfig = {
	maxFileSize: 10 * 1024 * 1024, // 10 MB
};

const DEFAULT_FEATURES: FeaturesConfig = {
	recordHierarchy: { pluralizeSchemasName: false },
};

const DEFAULT_ID_SERVICE: IdServiceConfig = {
	useLocal: true,
	customAlphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	customSize: 21,
};

export async function createLyricProvider(config: LyricProviderConfig) {
	await migrate(config.db);

	const appConfig: AppConfig = {
		auth: { enabled: false },
		db: config.db,
		schemaService: config.schemaService,
		features: config.features ?? DEFAULT_FEATURES,
		idService: config.idService ?? DEFAULT_ID_SERVICE,
		logger: config.logger ?? { level: 'silent' },
		submissionService: config.submissionService ?? DEFAULT_SUBMISSION_SERVICE,
		validator: config.validator ?? [],
	};

	const lyricProvider = provider(appConfig);

	const disconnect = async (): Promise<void> => {
		await getConnectionPool(lyricProvider.configs.db)?.end();
	};

	return { ...lyricProvider, disconnect };
}
