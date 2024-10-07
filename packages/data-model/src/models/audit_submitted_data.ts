import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import type { DataRecord } from '@overture-stack/lectern-client';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';
import { submissions } from './submissions.js';

export const audit_action = pgEnum('audit_action', ['UPDATE', 'DELETE']);

export type DataDiff = {
	old: DataRecord;
	new: DataRecord;
};

export const auditSubmittedData = pgTable('audit_submitted_data', {
	id: serial('id').primaryKey(),
	action: audit_action('action').notNull(),
	dictionaryCategoryId: integer('dictionary_category_id')
		.references(() => dictionaryCategories.id)
		.notNull(),
	dataDiff: jsonb('data_diff').$type<DataDiff>(),
	entityName: varchar('entity_name').notNull(),
	lastValidSchemaId: integer('last_valid_schema_id').references(() => dictionaries.id),
	newDataIsValid: boolean('new_data_is_valid').notNull(),
	oldDataIsValid: boolean('old_data_is_valid').notNull(),
	organization: varchar('organization').notNull(),
	originalSchemaId: integer('original_schema_id')
		.references(() => dictionaries.id)
		.notNull(),
	submissionId: integer('submission_id')
		.references(() => submissions.id)
		.notNull(),
	systemId: varchar('system_id').notNull(),
	createdAt: timestamp('created_at'),
	createdBy: varchar('created_by'),
});

export const auditSubmittedDataRelations = relations(auditSubmittedData, ({ one }) => ({
	dictionaryCategory: one(dictionaryCategories, {
		fields: [auditSubmittedData.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
	lastValidSchema: one(dictionaries, {
		fields: [auditSubmittedData.lastValidSchemaId],
		references: [dictionaries.id],
		relationName: 'lastValidSchema',
	}),
	originalSchema: one(dictionaries, {
		fields: [auditSubmittedData.originalSchemaId],
		references: [dictionaries.id],
		relationName: 'originalSchema',
	}),
	submission: one(submissions, {
		fields: [auditSubmittedData.submissionId],
		references: [submissions.id],
		relationName: 'submission',
	}),
}));

export type AuditSubmittedData = typeof auditSubmittedData.$inferSelect; // return type when queried
export type NewAuditSubmittedData = typeof auditSubmittedData.$inferInsert; // insert type
