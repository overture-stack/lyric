import 'dotenv/config';

import { AppConfig } from 'common';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
		upload_limit: process.env.UPLOAD_LIMIT || '50mb',
	};
};

export const defaultAppConfig: AppConfig = {
	db: {
		host: process.env.DB_URL || '',
		port: Number(process.env.DB_PORT) || 5432,
		database: process.env.DB_NAME || '',
		user: process.env.DB_USER || '',
		password: process.env.DB_PASSWORD || '',
	},
	schemaService: {
		url: process.env.LECTERN_URL || '',
	},
	logger: {
		level: process.env.LOG_LEVEL || 'info',
	},
};
