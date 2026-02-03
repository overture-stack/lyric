import { and, eq } from 'drizzle-orm';

import {
	type DictionaryMigration,
	dictionaryMigration,
	type NewDictionaryMigration,
} from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import type { MigrationStatus, PaginationOptions } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_REPOSITORY';
	const { db, logger } = dependencies;

	return {
		/**
		 * Save a new Dictionary Migration in Database
		 * Returns the inserted record's ID
		 **/
		save: async (data: NewDictionaryMigration): Promise<number> => {
			try {
				const savedMigration = await db
					.insert(dictionaryMigration)
					.values(data)
					.returning({ id: dictionaryMigration.id });
				logger.debug(LOG_MODULE, `Dictionary Migration for categoryId '${data.categoryId}' saved successfully`);
				return savedMigration[0].id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving dictionary migration for categoryId '${data.categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		/** Update an existing Dictionary Migration in Database */
		update: async (migrationId: number, data: Partial<DictionaryMigration>): Promise<number> => {
			try {
				const updatedMigration = await db
					.update(dictionaryMigration)
					.set(data)
					.where(eq(dictionaryMigration.id, migrationId))
					.returning({ id: dictionaryMigration.id });
				logger.debug(LOG_MODULE, `Dictionary Migration with id '${migrationId}' updated successfully`);
				return updatedMigration[0].id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating dictionary migration with id '${migrationId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		/** Retrieve a Dictionary Migration by ID */
		getMigrationById: async (migrationId: number): Promise<DictionaryMigration | undefined> => {
			try {
				const migration = await db.query.dictionaryMigration.findFirst({
					where: eq(dictionaryMigration.id, migrationId),
				});
				if (migration) {
					logger.debug(LOG_MODULE, `Fetched migration with id '${migrationId}'`);
				} else {
					logger.debug(LOG_MODULE, `No migration found with id '${migrationId}'`);
				}
				return migration;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed fetching dictionary migration with id '${migrationId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		/** Retrieve Dictionary Migrations by Category ID with filter options */
		getMigrationsByCategoryId: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			filterOptions: { status?: MigrationStatus; fromDictionaryId?: number; toDictionaryId?: number },
		): Promise<DictionaryMigration[]> => {
			const { page, pageSize } = paginationOptions;

			const { status, fromDictionaryId, toDictionaryId } = filterOptions;
			try {
				const migrations = await db.query.dictionaryMigration.findMany({
					where: and(
						eq(dictionaryMigration.categoryId, categoryId),
						status ? eq(dictionaryMigration.status, status) : undefined,
						fromDictionaryId ? eq(dictionaryMigration.fromDictionaryId, fromDictionaryId) : undefined,
						toDictionaryId ? eq(dictionaryMigration.toDictionaryId, toDictionaryId) : undefined,
					),
					orderBy: (dictionaryMigration, { desc }) => desc(dictionaryMigration.createdAt),
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
				logger.debug(LOG_MODULE, `Fetched ${migrations.length} migrations for categoryId '${categoryId}'`);
				return migrations;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed fetching dictionary migrations for categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
