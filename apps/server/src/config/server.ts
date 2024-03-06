import 'dotenv/config';

import { AppConfig } from 'common';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
		upload_limit: process.env.UPLOAD_LIMIT || '50mb',
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
		host: getRequiredConfig('DB_URL'),
		port: Number(getRequiredConfig('DB_PORT')),
		database: getRequiredConfig('DB_NAME'),
		user: getRequiredConfig('DB_USER'),
		password: getRequiredConfig('DB_PASSWORD'),
	},
	schemaService: {
		url: getRequiredConfig('LECTERN_URL'),
	},
	logger: {
		level: process.env.LOG_LEVEL || 'info',
	},
};
