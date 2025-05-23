import 'dotenv/config';

import { AppConfig } from '@overture-stack/lyric';
import type { ValidatorEntry } from '@overture-stack/lyric/dist/src/config/config.js';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
		allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
		corsEnabled: getBoolean(process.env.CORS_ENABLED, false),
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

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

const getJSONConfig = (name: string) => {
	const value = process.env[name];

	if (!value) {
		return;
	}

	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`Environment variable '${name}' must be a valid JSON.`);
	}
};

const isValidValidatorEntry = (obj: unknown): obj is ValidatorEntry => {
	return typeof obj === 'object' && obj !== null && 'categoryId' in obj && 'entityName' in obj && 'fieldName' in obj;
};

const getValidatorConfig = (name: string) => {
	const jsonConfig = getJSONConfig(name);

	if (!Array.isArray(jsonConfig)) {
		throw new Error(`Environment variable '${name}' must be a JSON array.`);
	}

	if (!jsonConfig.every(isValidValidatorEntry)) {
		throw new Error(
			`Environment variable '${name}' must be an array of objects with properties: 'categoryId', 'entityName', and 'fieldName'.`,
		);
	}
	return jsonConfig;
};

export const appConfig: AppConfig = {
	auth: {
		enabled: false,
	},
	db: {
		host: getRequiredConfig('DB_HOST'),
		port: Number(getRequiredConfig('DB_PORT')),
		database: getRequiredConfig('DB_NAME'),
		user: getRequiredConfig('DB_USER'),
		password: getRequiredConfig('DB_PASSWORD'),
	},
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
		customSize: Number(process.env.ID_CUSTOM_SIZE) || 21,
	},
	logger: {
		level: process.env.LOG_LEVEL || 'info',
	},
	schemaService: {
		url: getRequiredConfig('LECTERN_URL'),
	},
	validator: getValidatorConfig('VALIDATOR_CONFIG'),
};
