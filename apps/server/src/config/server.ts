import 'dotenv/config';

import { AppConfig } from 'data-provider';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
	};
};

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

export const defaultAppConfig: AppConfig = {
	db: {
		host: getRequiredConfig('DB_HOST'),
		port: Number(getRequiredConfig('DB_PORT')),
		database: getRequiredConfig('DB_NAME'),
		user: getRequiredConfig('DB_USER'),
		password: getRequiredConfig('DB_PASSWORD'),
	},
	idService: {
		useLocal: Boolean(process.env.ID_USELOCAL) || true,
		customAlphabet: process.env.ID_CUSTOM_ALPHABET || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
		customSize: Number(process.env.ID_CUSTOM_SIZE) || 21,
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
