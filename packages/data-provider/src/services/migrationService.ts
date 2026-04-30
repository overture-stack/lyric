import type { NewDictionaryMigration } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import createAuditRepository from '../repository/auditRepository.js';
import createCategoryRepository from '../repository/categoryRepository.js';
import createMigrationRepository, {
	type MigrationRecordWithRelations,
} from '../repository/dictionaryMigrationRepository.js';
import createSubmittedDataRepository from '../repository/submittedRepository.js';
import { formatMigrationSummary } from '../utils/migrationUtils.js';
import { failure, type PaginatedResult, type Result, success } from '../utils/result.js';
import type { MigrationAuditRecord, MigrationStatus, PaginationOptions } from '../utils/types.js';
import submissionProcessorFactory from './submission/submissionProcessor.js';
import submissionService from './submission/submissionService.js';

const migrationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_SERVICE';
	const { logger, onFinishCommit } = dependencies;
	const migrationRepository = createMigrationRepository(dependencies);
	const auditRepository = createAuditRepository(dependencies);
	const categoryRepository = createCategoryRepository(dependencies);
	const submittedDataRepository = createSubmittedDataRepository(dependencies);
	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	/**
	 * Update the status of the migration to COMPLETED or FAILED
	 * @param migrationId The ID of the migration to finalize
	 * @param status The final status of the migration, either 'COMPLETED' or 'FAILED'
	 * @param userName The name of the user that is finalizing the migration (for audit purposes)
	 * @returns A Result object with null data and a string error message in case of failure
	 */
	const finalizeMigration = async ({
		migrationId,
		status,
		userName,
	}: {
		migrationId: number;
		status: Extract<MigrationStatus, 'COMPLETED' | 'FAILED'>;
		userName: string;
	}): Promise<Result<null, string>> => {
		try {
			const resultUpdate = await migrationRepository.update(migrationId, {
				status,
				updatedAt: new Date(),
				updatedBy: userName,
			});

			if (resultUpdate === 0) {
				logger.info(LOG_MODULE, `Migration with id '${migrationId}' not found for finalization`);
				return failure(`Migration with id '${migrationId}' not found.`);
			}
			logger.info(LOG_MODULE, `Migration finalized for migrationId '${migrationId}' with status '${status}'`);
			return success(null);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(LOG_MODULE, `Error finalizing migration for migrationId '${migrationId}'`, errorMessage);
			return failure(`Error finalizing migration for migrationId '${migrationId}'`);
		}
	};

	/**
	 * Find the active migration by category ID
	 * @param categoryId The ID of the category to find the active migration for
	 * @returns	The active migration for the given category ID, or null if no active migration exists
	 * @throws Will throw an error if there is an issue retrieving the migration from the repository
	 */
	const getActiveMigrationByCategoryId = async (categoryId: number): Promise<MigrationRecordWithRelations | null> => {
		try {
			const migrations = await migrationRepository.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ status: 'IN_PROGRESS' },
			);
			const activeMigration = migrations.result[0];
			if (activeMigration) {
				logger.info(LOG_MODULE, `Active migration found for categoryId '${categoryId}'`);
				return formatMigrationSummary(activeMigration);
			} else {
				logger.info(LOG_MODULE, `No active migration for categoryId '${categoryId}'`);
				return null;
			}
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving active migration for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	/**
	 * Find a migration by its ID
	 * @param migrationId The ID of the migration to find
	 * @returns The migration with the given ID, or null if no migration exists
	 * @throws Will throw an error if there is an issue retrieving the migration from the repository
	 */
	const getMigrationById = async (migrationId: number): Promise<MigrationRecordWithRelations | null> => {
		try {
			const migration = await migrationRepository.getMigrationById(migrationId);
			if (migration) {
				logger.info(LOG_MODULE, `Migration found for migrationId '${migrationId}'`);

				const invalidRecords = await auditRepository.getTotalRecordsByCategoryIdAndOrganization(migration.category.id, {
					page: -1,
					pageSize: -1,
					newIsValid: false,
					submissionId: migration.submissionId,
				});

				return formatMigrationSummary({ ...migration, invalidRecords });
			} else {
				logger.info(LOG_MODULE, `No migration found for migrationId '${migrationId}'`);
				return null;
			}
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving migration with id '${migrationId}'`, error);
			throw error;
		}
	};

	/**
	 * Find migrations by category ID with pagination options
	 * @param categoryId The ID of the category to find migrations for
	 * @param paginationOptions The pagination options to apply
	 * @returns An object containing the metadata and the list of migrations
	 * @throws Will throw an error if there is an issue retrieving the migrations from the repository
	 */
	const getMigrationsByCategoryId = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
	): Promise<PaginatedResult<MigrationRecordWithRelations>> => {
		try {
			const migrations = await migrationRepository.getMigrationsByCategoryId(categoryId, paginationOptions, {});

			return {
				metadata: {
					totalRecords: migrations.metadata.totalRecords,
				},
				result: migrations.result.map(formatMigrationSummary),
			};
		} catch (error) {
			logger.error(LOG_MODULE, `Error retrieving migrations for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	const getMigrationRecords = async (
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
			const migrationRecords = await migrationRepository.getMigrationAuditRecords(migrationId, options);
			logger.info(
				LOG_MODULE,
				`Migration records retrieved for migrationId '${migrationId}' with options '${JSON.stringify(options)}'`,
			);
			return {
				result: migrationRecords.result,
				metadata: migrationRecords.metadata,
			};
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`Error retrieving migration records for migrationId '${migrationId}' with options '${JSON.stringify(options)}'`,
				error,
			);
			throw error;
		}
	};

	/**
	 * Creates a Migration record or update retries if one exists.
	 * Then, it starts running migration in a worker thread
	 * @param param0
	 * @returns The result of the migration initiation process, with the migrationId in case of success or
	 *  an error message in case of failure
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
	}): Promise<Result<number, string>> => {
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
			const existingMigration = findMigrationResult.result[0];
			if (existingMigration) {
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
					status: 'IN_PROGRESS',
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
			return success(migrationId);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(LOG_MODULE, `Error initiating migration for categoryId '${categoryId}'`, errorMessage);
			return failure(`Error initiating migration for categoryId '${categoryId}'`);
		}
	};

	/**
	 * **This function is designed to be executed in a worker thread.**
	 * Performs the Submitted data validation for a given migration,
	 * it iterates over all organizations and validates the submitted data for each of them.
	 * @param migrationId The ID of the migration to perform
	 * @param userName The name of the user that initiated the migration (for audit purposes)
	 * @returns A Result object with null data and a string error message in case of failure
	 */
	const performMigrationValidation = async ({
		migrationId,
		userName,
	}: {
		migrationId: number;
		userName: string;
	}): Promise<Result<null, string>> => {
		const { getAllOrganizationsByCategoryId, getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepository;
		const { getActiveDictionaryByCategory } = categoryRepository;
		const { performCommitSubmissionAsync } = submissionProcessor;

		try {
			const migration = await migrationRepository.getMigrationById(migrationId);
			if (!migration) {
				return failure(`Migration with id '${migrationId}' not found`);
			}

			const { category, submissionId } = migration;

			const dictionary = await getActiveDictionaryByCategory(category.id);
			if (!dictionary) {
				return failure(`Dictionary in category '${category.id}' not found`);
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
			return success(null);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(LOG_MODULE, `Error performing migration validation for migrationId '${migrationId}'`, errorMessage);
			return failure(`Error performing migration validation for migrationId '${migrationId}'`);
		}
	};

	return {
		finalizeMigration,
		getActiveMigrationByCategoryId,
		getMigrationsByCategoryId,
		getMigrationById,
		getMigrationRecords,
		initiateMigration,
		performMigrationValidation,
	};
};

export default migrationService;
