import createMigrationService from '../services/migrationService.js';
import type { DictionaryMigrationWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

export const performDictionaryMigration = async ({ migrationId, userName }: DictionaryMigrationWorkerInput) => {
	const dependencies = getWorkerDependencies();
	const migrationService = createMigrationService(dependencies);

	const resultMigration = await migrationService.performMigrationValidation({ migrationId, userName });

	if (resultMigration.success) {
		migrationService.finalizeMigration({
			migrationId,
			status: 'COMPLETED',
			userName,
		});
	} else {
		console.error(`Migration validation failed for migrationId '${migrationId}' with error: ${resultMigration.data}`);
		migrationService.finalizeMigration({
			migrationId,
			status: 'FAILED',
			userName,
		});
	}
};
