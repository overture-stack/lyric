import type { DictionaryMigration, NewDictionaryMigration } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import migrationRepository from '../repository/dictionaryMigrationRepository.js';

const migrationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'MIGRATION_SERVICE';
	const { logger } = dependencies;
	const migrationRepo = migrationRepository(dependencies);

	return {
		getActiveMigrationByCategoryId: async (categoryId: number): Promise<DictionaryMigration | null> => {
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
		},
		initiateMigration: async ({
			categoryId,
			fromDictionaryId,
			toDictionaryId,
			submissionId,
			userName,
		}: {
			categoryId: number;
			fromDictionaryId: number;
			toDictionaryId: number;
			submissionId: number;
			userName: string;
		}): Promise<{ id: number }> => {
			try {
				// TODO: Check if there's already an active migration for this categoryId
				// if it exists, increment retries, else if not exists create new migration
				const newMigration: NewDictionaryMigration = {
					categoryId,
					fromDictionaryId,
					toDictionaryId,
					submissionId,
					createdBy: userName,
					status: 'IN-PROGRESS',
				};
				const savedMigration = await migrationRepo.save(newMigration);
				logger.info(LOG_MODULE, `Migration initiated for categoryId '${categoryId}'`);
				return savedMigration;
			} catch (error) {
				logger.error(LOG_MODULE, `Error initiating migration for categoryId '${categoryId}'`, error);
				throw error;
			}
		},
	};
};

export default migrationService;
