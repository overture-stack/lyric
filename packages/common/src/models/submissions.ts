import { relations } from 'drizzle-orm';

import { integer, jsonb, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';

export const submissionStateEnum = pgEnum('submission_state', ['OPEN', 'VALID', 'INVALID', 'CLOSED', 'COMMITTED']);

export const submissions = pgTable('submissions', {
	id: serial('id').primaryKey(),
	state: submissionStateEnum('state'),
	dictionaryCategoryId: integer('dictionary_category_id').references(() => dictionaryCategories.id),
	organization: varchar('organization').notNull(),
	data: jsonb('data').notNull(),
	errors: jsonb('errors'),
	dictionaryId: integer('dictionary_id').references(() => dictionaries.id),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at').defaultNow(),
	updatedBy: varchar('updated_by'),
});

export const submissionRelations = relations(submissions, ({ one }) => ({
	dictionaryCategory: one(dictionaryCategories, {
		fields: [submissions.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
	dictionary: one(dictionaries, {
		fields: [submissions.dictionaryId],
		references: [dictionaries.id],
	}),
}));

export type Submission = typeof submissions.$inferSelect; // return type when queried
export type NewSubmission = typeof submissions.$inferInsert; // insert type
