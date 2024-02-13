import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { dictionaryCategories } from './dictionary_categories';

export const dictionaries = pgTable('dictionaries', {
	id: serial('id').primaryKey(),
	name: varchar('name').notNull(),
	version: varchar('version').notNull(),
	dictionaryCategoryId: integer('dictionary_category_id'),
	dictionary: jsonb('dictionary'),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
});

export const dictionaryRelations = relations(dictionaries, ({ one }) => ({
	dictionaryCategory: one(dictionaryCategories, {
		fields: [dictionaries.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
}));