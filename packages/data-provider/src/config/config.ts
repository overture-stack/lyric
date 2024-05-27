import * as schema from 'data-model';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from './logger.js';

export type DbInfo = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
};

export type SchemaServiceInfo = {
	url: string;
};

export type LoggerConfig = {
	level?: string;
	file?: boolean;
};

export type LimitsConfig = {
	fileSize: string;
};

export type IdServiceInfo = {
	useLocal: boolean;
	customAlphabet: string;
	customSize: number;
};

/**
 * Environment variables to configure internal and external resources
 * (database, external services, logger, etc)
 */
export type AppConfig = {
	db: DbInfo;
	limits: LimitsConfig;
	logger: LoggerConfig;
	schemaService: SchemaServiceInfo;
	idService: IdServiceInfo;
};

/**
 * Base Dependencies required for utils/services
 */
export interface BaseDependencies {
	db: NodePgDatabase<typeof schema>;
	logger: Logger;
	limits: LimitsConfig;
	schemaService: SchemaServiceInfo;
	idService: IdServiceInfo;
}
