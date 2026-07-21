import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	formatMigrationAuditRecord,
	formatMigrationSummary,
	type MigrationSummary,
} from '../../../src/utils/migrationResponseFormatter.js';
import type { AuditRepositoryRecord, MigrationAuditRecord } from '../../../src/utils/types.js';

describe('Migration Utils', () => {
	describe('formatMigrationSummary', () => {
		it('should return migration summary with properties ordered as defined by the formatter function', () => {
			const now = new Date('2026-04-30T10:00:00.000Z');
			const expectedPropertyOrder = [
				'id',
				'category',
				'fromDictionary',
				'toDictionary',
				'submissionId',
				'invalidRecords',
				'status',
				'retries',
				'createdAt',
				'createdBy',
				'updatedAt',
				'updatedBy',
			];
			const migrationSummary: MigrationSummary = {
				id: 10,
				submissionId: 25,
				status: 'IN_PROGRESS',
				retries: 1,
				createdAt: now,
				createdBy: 'test-user',
				updatedAt: now,
				updatedBy: 'test-user',
				category: { id: 3, name: 'birds' },
				fromDictionary: { name: 'animals', version: '1.0.0' },
				toDictionary: { name: 'animals', version: '2.0.0' },
				invalidRecords: 2,
			};

			const result = formatMigrationSummary(migrationSummary);

			expect(Object.keys(result)).to.eql(expectedPropertyOrder);

			expect(result).to.eql({
				id: 10,
				category: { id: 3, name: 'birds' },
				fromDictionary: { name: 'animals', version: '1.0.0' },
				toDictionary: { name: 'animals', version: '2.0.0' },
				submissionId: 25,
				invalidRecords: 2,
				status: 'IN_PROGRESS',
				retries: 1,
				createdAt: now,
				createdBy: 'test-user',
				updatedAt: now,
				updatedBy: 'test-user',
			});
		});
	});

	describe('formatMigrationAuditRecord', () => {
		it('should convert repository audit record to migration audit response shape', () => {
			const now = new Date('2026-04-30T11:00:00.000Z');
			const repositoryRecord: AuditRepositoryRecord = {
				action: 'MIGRATION',
				entityName: 'sport',
				dataDiff: null,
				errors: null,
				newDataIsValid: false,
				oldDataIsValid: true,
				organization: 'lyric-org',
				submissionId: 44,
				systemId: 'sys-001',
				createdAt: now,
				createdBy: 'test-user',
			};

			const result: MigrationAuditRecord = formatMigrationAuditRecord(repositoryRecord);

			expect(result).to.eql({
				entityName: 'sport',
				dataDiff: null,
				errors: null,
				newDataIsValid: false,
				oldDataIsValid: true,
				organization: 'lyric-org',
				systemId: 'sys-001',
				createdAt: now,
				createdBy: 'test-user',
			});
		});
	});
});
