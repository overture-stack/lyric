import * as schema from '@overture-stack/lyric-data-model';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from './logger.js';

export type dbInfo = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
};

export type schemaServiceInfo = {
	url: string;
};

export type LoggerConfig = {
	level?: string;
	file?: boolean;
};

export type LimitsConfig = {
	fileSize: string;
};

/**
 * Environment variables to configure internal and external resources
 * (database, external services, logger, etc)
 */
export type AppConfig = {
	db: dbInfo;
	limits: LimitsConfig;
	logger: LoggerConfig;
	schemaService: schemaServiceInfo;
};

/**
 * Base Dependencies required for utils/services
 */
export interface BaseDependencies {
	db: NodePgDatabase<typeof schema>;
	logger: Logger;
	limits: LimitsConfig;
	schemaService: schemaServiceInfo;
}
