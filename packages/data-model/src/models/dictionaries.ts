import { jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { Schema } from '@overture-stack/lectern-client';
/* eslint-disable @typescript-eslint/no-empty-object-type */
interface SchemaDefinition extends Schema {}

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
