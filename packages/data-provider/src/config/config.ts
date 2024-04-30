import * as schema from 'data-model';
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

/**
 * Environment variables to configure internal and external resources
 * (database, external services, logger, etc)
 */
export type AppConfig = {
	db: dbInfo;
	schemaService: schemaServiceInfo;
	logger: LoggerConfig;
};

/**
 * Dependencies required for utils/services
 */
export interface Dependencies {
	db: NodePgDatabase<typeof schema>;
	config: AppConfig;
	logger: Logger;
}
