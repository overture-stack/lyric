import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { DataRecord } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';

export const submittedData = pgTable('submitted_data', {
	id: serial('id').primaryKey(),
	data: jsonb('data').$type<DataRecord>().notNull(),
	dictionaryCategoryId: integer('dictionary_category_id').references(() => dictionaryCategories.id),
	entityName: varchar('entity_name').notNull(),
	isValid: boolean('is_valid'),
	lastValidSchemaId: integer('last_valid_schema_id').references(() => dictionaries.id),
	organization: varchar('organization').notNull(),
	originalSchemaId: integer('original_schema_id').references(() => dictionaries.id),
	systemId: varchar('system_id').unique().notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at').defaultNow(),
	updatedBy: varchar('updated_by'),
});

export const submittedDataRelations = relations(submittedData, ({ one }) => ({
	dictionaryCategory: one(dictionaryCategories, {
		fields: [submittedData.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
	lastValidSchema: one(dictionaries, {
		fields: [submittedData.lastValidSchemaId],
		references: [dictionaries.id],
		relationName: 'lastValidSchema',
	}),
	originalSchema: one(dictionaries, {
		fields: [submittedData.originalSchemaId],
		references: [dictionaries.id],
		relationName: 'originalSchema',
	}),
}));

export type SubmittedData = typeof submittedData.$inferSelect; // return type when queried
export type NewSubmittedData = typeof submittedData.$inferInsert; // insert type
