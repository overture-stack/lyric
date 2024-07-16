import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { DataRecord } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';

export const audit_action = pgEnum('audit_action', ['UPDATE', 'DELETE']);

export const auditSubmittedData = pgTable('audit_submitted_data', {
	id: serial('id').primaryKey(),
	action: audit_action('action').notNull(),
	comment: varchar('comment'),
	dictionaryCategoryId: integer('dictionary_category_id')
		.references(() => dictionaryCategories.id)
		.notNull(),
	entityName: varchar('entity_name').notNull(),
	lastValidSchemaId: integer('last_valid_schema_id')
		.references(() => dictionaries.id)
		.notNull(),
	newData: jsonb('new_data').$type<DataRecord>(),
	newDataIsValid: boolean('new_data_is_valid').notNull(),
	oldData: jsonb('old_data').$type<DataRecord>(),
	oldDataIsValid: boolean('old_data_is_valid').notNull(),
	organization: varchar('organization').notNull(),
	originalSchemaId: integer('original_schema_id')
		.references(() => dictionaries.id)
		.notNull(),
	systemId: varchar('system_id').notNull(),
	updatedAt: timestamp('updatedAt'),
	updatedBy: varchar('updatedBy'),
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
}));

export type AuditSubmittedData = typeof auditSubmittedData.$inferSelect; // return type when queried
export type NewAuditSubmittedData = typeof auditSubmittedData.$inferInsert; // insert type
