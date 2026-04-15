import type { MigrationRecordWithRelations } from '../repository/dictionaryMigrationRepository.js';

/**
 * Order the properties of the Migration Record
 * @param migration
 * @returns
 */
export const formatMigrationRecord = (migration: MigrationRecordWithRelations): MigrationRecordWithRelations => ({
	id: migration.id,
	category: migration.category,
	fromDictionary: migration.fromDictionary,
	toDictionary: migration.toDictionary,
	submissionId: migration.submissionId,
	status: migration.status,
	retries: migration.retries,
	createdAt: migration.createdAt,
	createdBy: migration.createdBy,
	updatedAt: migration.updatedAt,
	updatedBy: migration.updatedBy,
});
