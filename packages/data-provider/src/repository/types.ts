import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

/**
 * Represents a database transaction for the repository, parameterized by the schema type.
 */
export type RepositoryTransaction<TSchema extends Record<string, unknown>> = PgTransaction<
	PostgresJsQueryResultHKT,
	TSchema,
	ExtractTablesWithRelations<TSchema>
>;
