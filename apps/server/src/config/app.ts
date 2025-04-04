import 'dotenv/config';

import { AppConfig } from '@overture-stack/lyric';

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
};
