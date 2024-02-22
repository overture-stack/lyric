import 'dotenv/config';

import { AppConfig } from 'common';

export const getServerConfig = () => {
	return {
		port: process.env.PORT || 3030,
		debug_mode: process.env.DEBUG || false,
		upload_limit: process.env.UPLOAD_LIMIT || '50mb',
		schema_service_url: process.env.SCHEMA_SERVICE_URL || '',
	};
};

export const defaultAppConfig: AppConfig = {
	db: {
		host: process.env.LYRIC_DB_URL || '',
		port: Number(process.env.LYRIC_DB_PORT) || 5432,
		database: process.env.LYRIC_DB_NAME || '',
		user: process.env.LYRIC_DB_USER || '',
		password: process.env.LYRIC_DB_PASSWORD || '',
	},
	schemaService: {
		url: process.env.LECTERN_URL || '',
	},
};
