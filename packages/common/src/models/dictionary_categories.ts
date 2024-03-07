import { integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { relations } from 'drizzle-orm/relations';
import { dictionaries } from './dictionaries.js';

export const dictionaryCategories = pgTable('dictionary_categories', {
	id: serial('id').primaryKey(),
	name: varchar('name').unique().notNull(),
	activeDictionaryId: integer('active_dictionary_id').references(() => dictionaries.id),
	createdAt: timestamp('created_at').defaultNow(),
	udpatedAt: timestamp('udpated_at'),
});

export const categoryRelations = relations(dictionaryCategories, ({ one }) => ({
	dictionary: one(dictionaries, {
		fields: [dictionaryCategories.activeDictionaryId],
		references: [dictionaries.id],
	}),
}));

export type Category = typeof dictionaryCategories.$inferSelect; // return type when queried
export type NewCategory = typeof dictionaryCategories.$inferInsert; // insert type
