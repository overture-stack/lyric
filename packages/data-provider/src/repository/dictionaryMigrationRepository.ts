import { and, count, eq } from 'drizzle-orm';

import {
	type Category,
	type Dictionary,
	type DictionaryMigration,
	dictionaryMigration,
	type NewDictionaryMigration,
} from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { formatMigrationAuditRecord } from '../utils/migrationUtils.js';
import type { PaginatedResult } from '../utils/result.js';
import type {
	MigrationAuditRecord,
	MigrationStatus,
	PaginationOptions,
	PartialColumns,
	WithColumns,
} from '../utils/types.js';
import createAuditRepository from './auditRepository.js';

type MigrationRepositoryRecord = Omit<DictionaryMigration, 'categoryId' | 'fromDictionaryId' | 'toDictionaryId'>;

/**
 * Defines the structure of a Migration record returned by the repository,
 * includes related entities like category and dictionaries.
 */
export type MigrationRecordWithRelations = MigrationRepositoryRecord & {
	category: Pick<Category, 'id' | 'name'>;
	fromDictionary: Pick<Dictionary, 'name' | 'version'> | null;
	toDictionary: Pick<Dictionary, 'name' | 'version'> | null;
};

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_REPOSITORY';
	const { db, logger } = dependencies;

	const auditRepository = createAuditRepository(dependencies);

	const migrationRepositoryColumns = {
		id: true,
		status: true,
		submissionId: true,
		retries: true,
		createdAt: true,
		createdBy: true,
		updatedAt: true,
		updatedBy: true,
	} as const satisfies PartialColumns<MigrationRepositoryRecord>;

	const dictionarySummaryColumns = {
		columns: {
			name: true,
			version: true,
		},
	} as const satisfies WithColumns<Dictionary>;

	const migrationWithRelationsColumns = {
		category: {
			columns: {
				id: true,
				name: true,
			},
		},
		fromDictionary: dictionarySummaryColumns,
		toDictionary: dictionarySummaryColumns,
	} as const satisfies {
		category: WithColumns<Category>;
		fromDictionary: WithColumns<Dictionary>;
		toDictionary: WithColumns<Dictionary>;
	};

	return {
		/**
		 * Save a new Dictionary Migration in Database
		 * Returns the inserted record's ID
		 **/
		save: async (data: NewDictionaryMigration): Promise<number> => {
			try {
				const [savedMigration] = await db
					.insert(dictionaryMigration)
					.values(data)
					.returning({ id: dictionaryMigration.id });
				if (!savedMigration) {
					throw new Error(`Failed to insert Dictionary Migration for categoryId '${data.categoryId}', no row returned`);
				}
				logger.debug(LOG_MODULE, `Dictionary Migration for categoryId '${data.categoryId}' saved successfully`);
				return savedMigration.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving dictionary migration for categoryId '${data.categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		/** Update an existing Dictionary Migration in Database */
		update: async (migrationId: number, data: Partial<MigrationRepositoryRecord>): Promise<number> => {
			try {
				const [updatedMigration] = await db
					.update(dictionaryMigration)
					.set(data)
					.where(eq(dictionaryMigration.id, migrationId))
					.returning({ id: dictionaryMigration.id });
				if (!updatedMigration) {
					throw new Error(`Failed to update Dictionary Migration with id '${migrationId}', no row returned`);
				}
				logger.debug(LOG_MODULE, `Dictionary Migration with id '${migrationId}' updated successfully`);
				return updatedMigration.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating dictionary migration with id '${migrationId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		/** Retrieve a Dictionary Migration by ID */
		getMigrationById: async (migrationId: number): Promise<MigrationRecordWithRelations | undefined> => {
			try {
				const migration = await db.query.dictionaryMigration.findFirst({
					columns: migrationRepositoryColumns,
					with: migrationWithRelationsColumns,
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
		): Promise<PaginatedResult<MigrationRecordWithRelations>> => {
			const { page, pageSize } = paginationOptions;

			const { status, fromDictionaryId, toDictionaryId } = filterOptions;
			try {
				const whereConditions = and(
					eq(dictionaryMigration.categoryId, categoryId),
					status ? eq(dictionaryMigration.status, status) : undefined,
					fromDictionaryId ? eq(dictionaryMigration.fromDictionaryId, fromDictionaryId) : undefined,
					toDictionaryId ? eq(dictionaryMigration.toDictionaryId, toDictionaryId) : undefined,
				);

				const migrations = await db.query.dictionaryMigration.findMany({
					where: whereConditions,
					columns: migrationRepositoryColumns,
					with: migrationWithRelationsColumns,
					orderBy: (dictionaryMigration, { desc }) => desc(dictionaryMigration.createdAt),
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});

				const countMigrations = await db.select({ total: count() }).from(dictionaryMigration).where(whereConditions);
				const totalRecords = countMigrations[0]?.total ?? 0;

				logger.debug(
					LOG_MODULE,
					`Fetched ${migrations.length} migrations from a total of ${totalRecords} for categoryId '${categoryId}'`,
				);

				return {
					metadata: {
						totalRecords,
					},
					result: migrations,
				};
			} catch (error) {
				logger.error(LOG_MODULE, `Failed fetching dictionary migrations for categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
		getMigrationAuditRecords: async (
			migrationId: number,
			options: {
				page: number;
				pageSize: number;
				entityNames?: string | string[];
				organizations?: string | string[];
				isInvalid?: boolean;
			},
		): Promise<PaginatedResult<MigrationAuditRecord>> => {
			try {
				const migration = await db.query.dictionaryMigration.findFirst({
					where: eq(dictionaryMigration.id, migrationId),
				});

				if (!migration) {
					logger.debug(LOG_MODULE, `No migration found with id '${migrationId}' when fetching migration records`);
					return {
						result: [],
						metadata: { totalRecords: 0 },
					};
				}

				const newIsValid = options.isInvalid !== undefined ? !options.isInvalid : undefined;

				const records = await auditRepository.getRecordsByCategoryIdAndOrganizationPaginated(migration.categoryId, {
					page: options.page,
					pageSize: options.pageSize,
					newIsValid,
					submissionId: migration.submissionId,
				});

				const totalRecords = await auditRepository.getTotalRecordsByCategoryIdAndOrganization(migration.categoryId, {
					page: options.page,
					pageSize: options.pageSize,
					newIsValid,
					submissionId: migration.submissionId,
				});

				return {
					metadata: {
						totalRecords,
					},
					result: records.map(formatMigrationAuditRecord),
				};
			} catch (error) {
				logger.error(LOG_MODULE, `Failed fetching migration records for migrationId '${migrationId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
