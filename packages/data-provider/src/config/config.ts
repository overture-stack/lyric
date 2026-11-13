import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { DbConfig } from '@overture-stack/lyric-data-model';
import * as schema from '@overture-stack/lyric-data-model/models';

import type { AuthConfig } from '../middleware/auth.js';
import type { ResultOnCommit } from '../utils/types.js';
import type { WorkerFunctions } from '../workers/types.js';
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

/**
 * Body limits for the submission router, in bytes. `0` or omitted sets no limit of that kind.
 * - `maxFileSize`: the largest file accepted in an upload, and the largest JSON request body. When `0` or omitted,
 *   JSON bodies keep the JSON parser's default of 100kb.
 * - `maxRequestSize`: the largest upload accepted, counting every file in it together.
 */
export type SubmissionServiceConfig = {
	maxFileSize?: number;
	maxRequestSize?: number;
};

export type LoggerConfig = {
	file?: boolean;
	json?: boolean;
	level?: string;
};

export type IdServiceConfig = {
	useLocal: boolean;
	customAlphabet: string;
	customSize: number;
};

export type ValidatorEntry = {
	/** A category's numeric id or its alias; matched against the request's categoryId by string
	 * equality (see `findValidatorEntry`), not by shape. */
	categoryId: number | string;
	entityName: string;
	fieldName: string;
};

export type ValidatorConfig = ValidatorEntry[];

/**
 * Worker pool limits. Validation, commit and dictionary migration tasks run in the pool's workers.
 * - `maxWorkers`: the most workers running at the same time, an integer of at least 1. Defaults to 1.
 *   A task arriving while every worker is busy waits in a queue and starts when a worker is free.
 *   The default is fixed rather than taken from the machine's CPU count, which inside a container counts
 *   the whole node, not the container's CPU limit. Keep it at most one less than the CPUs given to Lyric:
 *   above that, workers take turns on the CPUs and tasks get slower, not faster. Each worker also holds its
 *   own database connection pool and its own memory. The README's "Choosing a value" shows how to size it.
 */
export type WorkerPoolSettings = {
	maxWorkers?: number;
};

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
	onFinishCommit?: (resultOnCommit: ResultOnCommit) => Promise<void>;
	schemaService: SchemaServiceConfig;
	submissionService: SubmissionServiceConfig;
	validator: ValidatorConfig;
	workerPool?: WorkerPoolSettings;
};

/**
 * Base Dependencies required for utils/services
 */
export interface BaseDependencies {
	db: NodePgDatabase<typeof schema>;
	features?: FeaturesConfig;
	idService: IdServiceConfig;
	logger: Logger;
	onFinishCommit?: (resultOnCommit: ResultOnCommit) => Promise<void>;
	schemaService: SchemaServiceConfig;
	submissionService: SubmissionServiceConfig;
	workerPool: WorkerFunctions;
}
