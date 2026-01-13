import { relations } from 'drizzle-orm';
import { integer, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';
import { submissions } from './submissions.js';

export const migrationStatusEnum = pgEnum('migration_status', ['IN-PROGRESS', 'COMPLETED', 'FAILED']);

export const dictionaryMigration = pgTable('dictionary_migration', {
	id: serial('id').primaryKey(),
	categoryId: integer('category_id')
		.references(() => dictionaryCategories.id)
		.notNull(),
	fromDictionaryId: integer('from_dictionary_id')
		.references(() => dictionaries.id)
		.notNull(),
	toDictionaryId: integer('to_dictionary_id')
		.references(() => dictionaries.id)
		.notNull(),
	submissionId: integer('submission_id')
		.references(() => submissions.id)
		.notNull(),
	status: migrationStatusEnum('status').notNull(),
	retries: integer('retries').notNull().default(0),
	createdAt: timestamp('created_at'),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at'),
	updatedBy: varchar('updated_by'),
});

export const dictionaryMigrationRelations = relations(dictionaryMigration, ({ one }) => ({
	category: one(dictionaryCategories, {
		fields: [dictionaryMigration.categoryId],
		references: [dictionaryCategories.id],
	}),
	fromDictionaryId: one(dictionaries, {
		fields: [dictionaryMigration.fromDictionaryId],
		references: [dictionaries.id],
		relationName: 'fromDictionary',
	}),
	toDictionaryId: one(dictionaries, {
		fields: [dictionaryMigration.toDictionaryId],
		references: [dictionaries.id],
		relationName: 'toDictionary',
	}),
	submission: one(submissions, {
		fields: [dictionaryMigration.submissionId],
		references: [submissions.id],
		relationName: 'submission',
	}),
}));

export type DictionaryMigration = typeof dictionaryMigration.$inferSelect; // return type when queried
export type NewDictionaryMigration = typeof dictionaryMigration.$inferInsert; // insert type
