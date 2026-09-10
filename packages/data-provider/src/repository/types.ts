import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

export type BooleanTrueObject = {
	[key: string]: true;
};

/**
 * Represents a database transaction for the repository, parameterized by the schema type.
 */
export type RepositoryTransaction<TSchema extends Record<string, unknown>> = PgTransaction<
	PostgresJsQueryResultHKT,
	TSchema,
	ExtractTablesWithRelations<TSchema>
>;

/**
 * Specifies which columns of a table to select in a Drizzle query
 * Used in the `columns` property of a Drizzle query
 */
export type PartialColumns<T> = Partial<Record<keyof T, boolean>>;

/**
 * Specifies additional columns to select in a Drizzle query for a related table.
 * Used in the `with` property of a Drizzle query
 */
export type WithColumns<T> = {
	columns: PartialColumns<T>;
};
