import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
	id: serial('id').primaryKey(),
	name: varchar('name').notNull().unique(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
