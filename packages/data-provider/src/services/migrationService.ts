import type { NewDictionaryMigration } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import createMigrationRepository, {
	type MigrationRecordWithRelations,
} from '../repository/dictionaryMigrationRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import type { MigrationStatus, PaginationOptions } from '../utils/types.js';
import submissionProcessorFactory from './submission/submissionProcessor.js';
import submissionService from './submission/submissionService.js';
import { formatMigrationRecord } from '../utils/migrationUtils.js';

const migrationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_SERVICE';
	const { logger, onFinishCommit } = dependencies;
	const migrationRepository = createMigrationRepository(dependencies);
	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	/**
	 * Update the status of the migration to COMPLETED or FAILED
	 * @param param0
	 * @returns The ID of the finalized migration
	 */
	const finalizeMigration = async ({
		migrationId,
		status,
		userName,
	}: {
		migrationId: number;
		status: Extract<MigrationStatus, 'COMPLETED' | 'FAILED'>;
		userName: string;
	}): Promise<number> => {
		try {
			const updatedMigration = await migrationRepository.update(migrationId, {
				status,
				updatedAt: new Date(),
				updatedBy: userName,
			});
			logger.info(LOG_MODULE, `Migration finalized for migrationId '${migrationId}' with status '${status}'`);
			return updatedMigration;
		} catch (error) {
			logger.error(LOG_MODULE, `Error finalizing migration for migrationId '${migrationId}'`, error);
			throw error;
		}
	};

	/**
	 * Find the active migration by category ID
	 * @param categoryId
	 * @returns
	 */
	const getActiveMigrationByCategoryId = async (categoryId: number): Promise<MigrationRecordWithRelations | null> => {
		try {
			const migrations = await migrationRepository.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ status: 'IN-PROGRESS' },
			);
			if (migrations.result.length > 0) {
				logger.info(LOG_MODULE, `Active migration found for categoryId '${categoryId}'`);
				return formatMigrationRecord(migrations.result[0]);
			} else {
				logger.info(LOG_MODULE, `No active migration for categoryId '${categoryId}'`);
				return null;
			}
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving active migration for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	const getMigrationById = async (migrationId: number): Promise<MigrationRecordWithRelations | undefined> => {
		try {
			const migration = await migrationRepository.getMigrationById(migrationId);
			if (migration) {
				logger.info(LOG_MODULE, `Migration found for migrationId '${migrationId}'`);
				return formatMigrationRecord(migration);
			} else {
				logger.info(LOG_MODULE, `No migration found for migrationId '${migrationId}'`);
				return undefined;
			}
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving migration with id '${migrationId}'`, error);
			throw error;
		}
	};

	const getMigrationsByCategoryId = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
	): Promise<{ metadata: { totalRecords: number; errorMessage?: string }; result: MigrationRecordWithRelations[] }> => {
		try {
			const migrations = await migrationRepository.getMigrationsByCategoryId(categoryId, paginationOptions, {});

			return {
				metadata: {
					totalRecords: migrations.metadata.totalRecords,
				},
				result: migrations.result.map(formatMigrationRecord),
			};
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving migrations for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	/**
	 * Creates a Migration record or update retries if one exists.
	 * Then, it starts running migration in a worker thread
	 * @param param0
	 * @returns The ID of the initiated or updated migration
	 */
	const initiateMigration = async ({
		categoryId,
		fromDictionaryId,
		toDictionaryId,
		userName,
	}: {
		categoryId: number;
		fromDictionaryId: number;
		toDictionaryId: number;
		userName: string;
	}): Promise<number> => {
		const { getOrCreateActiveSubmission } = submissionService(dependencies);
		try {
			const findMigrationResult = await migrationRepository.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ fromDictionaryId, toDictionaryId },
			);

			let migrationId: number;
			let submissionId: number;

			// Migration already exists, update retries count
			if (findMigrationResult.result.length > 0) {
				const existingMigration = findMigrationResult.result[0];
				const updatedRetriesCount = existingMigration.retries + 1;

				submissionId = existingMigration.submissionId;

				migrationId = await migrationRepository.update(existingMigration.id, {
					retries: updatedRetriesCount,
					updatedBy: userName,
					updatedAt: new Date(),
				});

				logger.info(
					LOG_MODULE,
					`Existing migration found for categoryId '${categoryId}'. Incremented retries to ${updatedRetriesCount}`,
				);
			} else {
				// Create new migration record
				submissionId = await getOrCreateActiveSubmission({
					categoryId,
					organization: '',
					username: userName,
				});

				const newMigration: NewDictionaryMigration = {
					categoryId,
					fromDictionaryId,
					toDictionaryId,
					submissionId,
					status: 'IN-PROGRESS',
					createdBy: userName,
					createdAt: new Date(),
				};

				migrationId = await migrationRepository.save(newMigration);

				logger.info(LOG_MODULE, `Creating migration record for categoryId '${categoryId}'`);
			}

			// Perform dictionary migration in a worker thread
			dependencies.workerPool.dictionaryMigration({
				migrationId,
				userName,
			});

			logger.info(LOG_MODULE, `Migration initiated for categoryId '${categoryId}'`);
			return migrationId;
		} catch (error) {
			logger.error(LOG_MODULE, `Error initiating migration for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	/**
	 * **This function is designed to be executed in a worker thread.**
	 * Performs the Submitted data validation for a given migration,
	 * it iterates over all organizations and validates the submitted data for each of them.
	 * @param migrationId The ID of the migration to perform
	 * @param userName The name of the user that initiated the migration (for audit purposes)
	 * @returns void
	 */
	const performMigrationValidation = async ({
		migrationId,
		userName,
	}: {
		migrationId: number;
		userName: string;
	}): Promise<void> => {
		const { getAllOrganizationsByCategoryId, getSubmittedDataByCategoryIdAndOrganization } =
			submittedDataRepository(dependencies);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { performCommitSubmissionAsync } = submissionProcessor;

		const migration = await migrationRepository.getMigrationById(migrationId);
		if (!migration) {
			throw new Error(`Migration with id '${migrationId}' not found`);
		}

		const { category, submissionId } = migration;

		const dictionary = await getActiveDictionaryByCategory(category.id);
		if (!dictionary) {
			throw new Error(`Dictionary in category '${category.id}' not found`);
		}

		const organizations = await getAllOrganizationsByCategoryId(category.id);
		logger.info(LOG_MODULE, `Starting migration validation for following organizations '${organizations}'`);
		for (const organization of organizations) {
			const submittedDataToValidate = await getSubmittedDataByCategoryIdAndOrganization(category.id, organization);
			logger.info(
				LOG_MODULE,
				`Performing migration validation for organization '${organization}' with ${submittedDataToValidate.length} submitted records`,
			);
			await performCommitSubmissionAsync({
				dataToValidate: {
					inserts: [],
					submittedData: submittedDataToValidate,
					deletes: [],
					updates: {},
				},
				submissionId,
				dictionary,
				username: userName,
				isMigration: true,
				onFinishCommit,
			});
		}
		logger.info(LOG_MODULE, `Migration validation completed for submissionId '${submissionId}'`);
	};

	return {
		finalizeMigration,
		getActiveMigrationByCategoryId,
		getMigrationsByCategoryId,
		getMigrationById,
		initiateMigration,
		performMigrationValidation,
	};
};

export default migrationService;
