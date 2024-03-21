import { integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { relations } from 'drizzle-orm/relations';
import { dictionaries } from './dictionaries.js';
import { submissions } from './submissions.js';
import { submittedData } from './submitted_data.js';

export const dictionaryCategories = pgTable('dictionary_categories', {
	id: serial('id').primaryKey(),
	name: varchar('name').unique().notNull(),
	activeDictionaryId: integer('active_dictionary_id'),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at'),
	updatedBy: varchar('updated_by'),
});

export const categoryRelations = relations(dictionaryCategories, ({ many, one }) => ({
	dictionaries: many(dictionaries),
	submissions: many(submissions),
	submittedDatas: many(submittedData),
	activeDictionary: one(dictionaries, {
		fields: [dictionaryCategories.activeDictionaryId],
		references: [dictionaries.id],
		relationName: 'activeDictionary',
	}),
}));

export type Category = typeof dictionaryCategories.$inferSelect; // return type when queried
export type NewCategory = typeof dictionaryCategories.$inferInsert; // insert type
