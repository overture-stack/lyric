import createMigrationService from '../services/migrationService.js';
import type { DictionaryMigrationWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

export const performDictionaryMigration = async ({ migrationId, userName }: DictionaryMigrationWorkerInput) => {
	const dependencies = getWorkerDependencies();
	const migrationService = createMigrationService(dependencies);

	try {
		await migrationService.performMigrationValidation({ migrationId, userName });
		migrationService.finalizeMigration({
			migrationId,
			status: 'COMPLETED',
			userName,
		});
	} catch (error) {
		console.error('Error performing migration validation:', error);
		migrationService.finalizeMigration({
			migrationId,
			status: 'FAILED',
			userName,
		});
	}
};
