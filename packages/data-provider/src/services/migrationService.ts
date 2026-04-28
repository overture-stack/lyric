import type { DictionaryMigration, NewDictionaryMigration } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import createMigrationRepository from '../repository/dictionaryMigrationRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import { failure, type Result, success } from '../utils/result.js';
import type { MigrationStatus } from '../utils/types.js';
import submissionProcessorFactory from './submission/submissionProcessor.js';
import submissionService from './submission/submissionService.js';

const migrationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_SERVICE';
	const { logger, onFinishCommit } = dependencies;
	const migrationRepository = createMigrationRepository(dependencies);
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
	 * @param categoryId
	 * @returns
	 */
	const getActiveMigrationByCategoryId = async (categoryId: number): Promise<DictionaryMigration | null> => {
		try {
			const migrations = await migrationRepository.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ status: 'IN_PROGRESS' },
			);
			if (migrations.length > 0 && migrations[0]) {
				logger.info(LOG_MODULE, `Active migration found for categoryId '${categoryId}'`);
				return migrations[0];
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
			const existingMigration = findMigrationResult[0];
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
		try {
			const { getAllOrganizationsByCategoryId, getSubmittedDataByCategoryIdAndOrganization } =
				submittedDataRepository(dependencies);
			const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
			const { performCommitSubmissionAsync } = submissionProcessor;

			const migration = await migrationRepository.getMigrationById(migrationId);
			if (!migration) {
				return failure(`Migration with id '${migrationId}' not found`);
			}

			const { categoryId, submissionId } = migration;

			const dictionary = await getActiveDictionaryByCategory(categoryId);
			if (!dictionary) {
				return failure(`Dictionary in category '${categoryId}' not found`);
			}

			const organizations = await getAllOrganizationsByCategoryId(categoryId);
			logger.info(LOG_MODULE, `Starting migration validation for following organizations '${organizations}'`);
			for (const organization of organizations) {
				const submittedDataToValidate = await getSubmittedDataByCategoryIdAndOrganization(categoryId, organization);
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
		initiateMigration,
		performMigrationValidation,
	};
};

export default migrationService;
