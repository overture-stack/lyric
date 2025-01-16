import { integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';

import { dictionaries } from './dictionaries.js';
import { submissions } from './submissions.js';
import { submittedData } from './submitted_data.js';

export const dictionaryCategories = pgTable('dictionary_categories', {
	id: serial('id').primaryKey(),
	activeDictionaryId: integer('active_dictionary_id').notNull(),
	defaultCentricEntity: varchar('default_centric_entity'),
	indexName: varchar('index_name'),
	name: varchar('name').unique().notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at'),
	updatedBy: varchar('updated_by'),
});

export const categoryRelations = relations(dictionaryCategories, ({ many, one }) => ({
	activeDictionary: one(dictionaries, {
		fields: [dictionaryCategories.activeDictionaryId],
		references: [dictionaries.id],
		relationName: 'activeDictionary',
	}),
	dictionaries: many(dictionaries),
	submissions: many(submissions),
	submittedDatas: many(submittedData),
}));

export type Category = typeof dictionaryCategories.$inferSelect; // return type when queried
export type NewCategory = typeof dictionaryCategories.$inferInsert; // insert type
