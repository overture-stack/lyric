import 'dotenv/config';

import { AppConfig } from '@overture-stack/lyric';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
	};
};

export const getBoolean = (env: string | undefined, defaultValue: boolean): boolean => {
	switch ((env ?? '').toLocaleLowerCase()) {
		case 'true':
			return true;
		case 'false':
			return false;
		default:
			return defaultValue;
	}
};

export const getNumber = (env: string | undefined): number | undefined => {
	const parsed = Number(env);
	return isNaN(parsed) ? undefined : parsed;
};

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

const getRequiredNumber = (name: string) => {
	const value = process.env[name];
	const parsedNumber = Number(value);
	if (isNaN(parsedNumber)) {
		throw new Error(`The Environment Variable '${name}' must be a valid number`);
	}
	return parsedNumber;
};

export const defaultAppConfig: AppConfig = {
	db: {
		host: getRequiredConfig('DB_HOST'),
		port: getRequiredNumber('DB_PORT'),
		database: getRequiredConfig('DB_NAME'),
		user: getRequiredConfig('DB_USER'),
		password: getRequiredConfig('DB_PASSWORD'),
	},
	indexer: getBoolean(process.env.INDEXER_ENABLED, false)
		? {
				elasticSearchConfig: {
					version: getRequiredNumber('INDEXER_VERSION'),
					nodes: getRequiredConfig('INDEXER_NODES'),
					basicAuth: {
						enabled: getBoolean(process.env.INDEXER_CLIENT_BASICAUTH_ENABLED, false),
						user: process.env.INDEXER_CLIENT_BASICAUTH_USER,
						password: process.env.INDEXER_CLIENT_BASICAUTH_PASSWORD,
					},
					connectionTimeOut: getNumber(process.env.INDEXER_CLIENT_CONNECTION_TIMEOUT),
					docsPerBulkReqMax: getNumber(process.env.INDEXER_CLIENT_DOCS_PER_BULK_REQ_MAX),
					retry: {
						retryMaxAttempts: getNumber(process.env.INDEXER_CLIENT_RETRY_MAX_ATTEMPTS),
						retryWaitDurationMillis: getNumber(process.env.INDEXER_CLIENT_RETRY_WAIT_DURATION_MILLIS),
					},
				},
			}
		: undefined,
	features: {
		audit: {
			enabled: getBoolean(process.env.AUDIT_ENABLED, true),
		},
		recordHierarchy: {
			pluralizeSchemasName: getBoolean(process.env.PLURALIZE_SCHEMAS_ENABLED, true),
		},
	},
	idService: {
		useLocal: getBoolean(process.env.ID_USELOCAL, true),
		customAlphabet: process.env.ID_CUSTOM_ALPHABET || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
		customSize: getNumber(process.env.ID_CUSTOM_SIZE) || 21,
	},
	schemaService: {
		url: getRequiredConfig('LECTERN_URL'),
	},
	limits: {
		fileSize: process.env.UPLOAD_LIMIT || '10mb',
	},
	logger: {
		level: process.env.LOG_LEVEL || 'info',
	},
};
