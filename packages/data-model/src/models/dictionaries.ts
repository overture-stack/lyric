import { jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { SchemaDefinition } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

export const dictionaries = pgTable('dictionaries', {
	id: serial('id').primaryKey(),
	dictionary: jsonb('dictionary').$type<SchemaDefinition[]>().notNull(),
	name: varchar('name').notNull(),
	version: varchar('version').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
});

export type Dictionary = typeof dictionaries.$inferSelect; // return type when queried
export type NewDictionary = typeof dictionaries.$inferInsert; // insert type
