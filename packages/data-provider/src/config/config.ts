import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@overture-stack/lyric-data-model';

import { Logger } from './logger.js';

export type AuditConfig = {
	enabled: boolean;
};

export type DbConfig = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
};

export type FeaturesConfig = {
	audit?: AuditConfig;
};

export type SchemaServiceConfig = {
	url: string;
};

export type LoggerConfig = {
	level?: string;
	file?: boolean;
};

export type LimitsConfig = {
	fileSize: string;
};

export type IdServiceConfig = {
	useLocal: boolean;
	customAlphabet: string;
	customSize: number;
};

/**
 * Environment variables to configure internal and external resources
 * (database, external services, logger, etc)
 */
export type AppConfig = {
	db: DbConfig;
	features?: FeaturesConfig;
	idService: IdServiceConfig;
	limits: LimitsConfig;
	logger: LoggerConfig;
	schemaService: SchemaServiceConfig;
};

/**
 * Base Dependencies required for utils/services
 */
export interface BaseDependencies {
	db: NodePgDatabase<typeof schema>;
	features?: FeaturesConfig;
	idService: IdServiceConfig;
	limits: LimitsConfig;
	logger: Logger;
	schemaService: SchemaServiceConfig;
}
