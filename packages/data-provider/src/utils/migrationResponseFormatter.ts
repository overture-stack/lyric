import type { MigrationRecordWithRelations } from '../repository/dictionaryMigrationRepository.js';
import type { AuditRepositoryRecord, MigrationAuditRecord } from './types.js';

export type MigrationSummary = MigrationRecordWithRelations & {
	invalidRecords?: number;
};

/**
 * Order the properties of the Migration Summary Record
 * @param migration
 * @returns
 */
export const formatMigrationSummary = (migration: MigrationSummary): MigrationSummary => ({
	id: migration.id,
	category: migration.category,
	fromDictionary: migration.fromDictionary,
	toDictionary: migration.toDictionary,
	submissionId: migration.submissionId,
	invalidRecords: migration.invalidRecords,
	status: migration.status,
	retries: migration.retries,
	createdAt: migration.createdAt,
	createdBy: migration.createdBy,
	updatedAt: migration.updatedAt,
	updatedBy: migration.updatedBy,
});

export const formatMigrationAuditRecord = (record: AuditRepositoryRecord): MigrationAuditRecord => ({
	entityName: record.entityName,
	dataDiff: record.dataDiff,
	errors: record.errors,
	newDataIsValid: record.newDataIsValid,
	oldDataIsValid: record.oldDataIsValid,
	organization: record.organization,
	systemId: record.systemId,
	createdAt: record.createdAt,
	createdBy: record.createdBy,
});
