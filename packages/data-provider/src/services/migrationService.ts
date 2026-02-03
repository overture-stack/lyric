import type { DictionaryMigration, NewDictionaryMigration } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import migrationRepository from '../repository/dictionaryMigrationRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import type { MigrationStatus } from '../utils/types.js';
import processor from './submission/processor.js';
import submissionService from './submission/submission.js';

const migrationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_SERVICE';
	const { logger, onFinishCommit } = dependencies;
	const migrationRepo = migrationRepository(dependencies);

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
			const updatedMigration = await migrationRepo.update(migrationId, {
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
	const getActiveMigrationByCategoryId = async (categoryId: number): Promise<DictionaryMigration | null> => {
		try {
			const migrations = await migrationRepo.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ status: 'IN-PROGRESS' },
			);
			if (migrations.length > 0) {
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
	 * It starts running migration asynchronously
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
			const existingMigrationResult = await migrationRepo.getMigrationsByCategoryId(
				categoryId,
				{ page: 1, pageSize: 1 },
				{ fromDictionaryId, toDictionaryId },
			);

			let migrationId: number;
			let submissionId: number;

			// Migration already exists, update retries count
			if (existingMigrationResult.length > 0) {
				const migration = existingMigrationResult[0];
				const updatedRetriesCount = migration.retries + 1;

				submissionId = migration.submissionId;

				migrationId = await migrationRepo.update(migration.id, {
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

				migrationId = await migrationRepo.save(newMigration);

				logger.info(LOG_MODULE, `Creating migration record for categoryId '${categoryId}'`);
			}

			// Start migration asynchronously
			performMigrationValidation({ categoryId, submissionId, userName })
				.then(() => {
					finalizeMigration({ migrationId, status: 'COMPLETED', userName });
				})
				.catch(async (error) => {
					logger.error(LOG_MODULE, `Error during migration validation for categoryId '${categoryId}'`, error);
					finalizeMigration({ migrationId, status: 'FAILED', userName });
				});

			logger.info(LOG_MODULE, `Migration initiated for categoryId '${categoryId}'`);
			return migrationId;
		} catch (error) {
			logger.error(LOG_MODULE, `Error initiating migration for categoryId '${categoryId}'`, error);
			throw error;
		}
	};

	/** Execute submitted data validation for the migration */
	const performMigrationValidation = async ({
		categoryId,
		submissionId,
		userName,
	}: {
		categoryId: number;
		submissionId: number;
		userName: string;
	}): Promise<void> => {
		const { getAllOrganizationsByCategoryId, getSubmittedDataByCategoryIdAndOrganization } =
			submittedDataRepository(dependencies);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { performCommitSubmissionAsync } = processor(dependencies);

		const dictionary = await getActiveDictionaryByCategory(categoryId);
		if (!dictionary) {
			throw new Error(`Dictionary in category '${categoryId}' not found`);
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
	};

	return {
		finalizeMigration,
		getActiveMigrationByCategoryId,
		initiateMigration,
		performMigrationValidation,
	};
};

export default migrationService;
