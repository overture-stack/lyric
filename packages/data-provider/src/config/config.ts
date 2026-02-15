import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { DbConfig } from '@overture-stack/lyric-data-model';
import * as schema from '@overture-stack/lyric-data-model/models';

import type { AuthConfig } from '../middleware/auth.js';
import type { ResultOnCommit } from '../utils/types.js';
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

export type SubmissionServiceConfig = {
	maxFileSize?: number;
};

export type LoggerConfig = {
	level?: string;
	file?: boolean;
};

export type IdServiceConfig = {
	useLocal: boolean;
	customAlphabet: string;
	customSize: number;
};

export type ValidatorEntry = {
	categoryId: number;
	entityName: string;
	fieldName: string;
};

export type ValidatorConfig = ValidatorEntry[];

/**
 * Environment variables to configure internal and external resources
 * (database, external services, logger, etc)
 */
export type AppConfig = {
	auth: AuthConfig;
	db: DbConfig;
	features?: FeaturesConfig;
	idService: IdServiceConfig;
	logger: LoggerConfig;
	onFinishCommit?: (resultOnCommit: ResultOnCommit) => void;
	schemaService: SchemaServiceConfig;
	submissionService: SubmissionServiceConfig;
	validator: ValidatorConfig;
};

/**
 * Base Dependencies required for utils/services
 */
export interface BaseDependencies {
	db: NodePgDatabase<typeof schema>;
	features?: FeaturesConfig;
	idService: IdServiceConfig;
	logger: Logger;
	onFinishCommit?: (resultOnCommit: ResultOnCommit) => void;
	schemaService: SchemaServiceConfig;
	submissionService?: SubmissionServiceConfig;
}
