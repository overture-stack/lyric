import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { DbConfig } from '@overture-stack/lyric-data-model';
import * as schema from '@overture-stack/lyric-data-model/models';

import type { AuthConfig } from '../middleware/auth.js';
import { Logger } from './logger.js';

export type AuditConfig = {
	enabled: boolean;
};

export type RecordHierarchyConfig = {
	pluralizeSchemasName: boolean;
};

export type FeaturesConfig = {
	audit?: AuditConfig;
	recordHierarchy: RecordHierarchyConfig;
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
	auth: AuthConfig;
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
