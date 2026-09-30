import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';
import { submissionFiles } from './submission_files.js';

export const submissionStatusEnum = pgEnum('submission_status', [
	'OPEN',
	'VALIDATING',
	'VALID',
	'INVALID',
	'CLOSED',
	'COMMITTING',
	'COMMITTED',
]);

export const submissions = pgTable(
	'submissions',
	{
		id: serial('id').primaryKey(),
		dictionaryCategoryId: integer('dictionary_category_id')
			.references(() => dictionaryCategories.id)
			.notNull(),
		dictionaryId: integer('dictionary_id')
			.references(() => dictionaries.id)
			.notNull(),
		organization: varchar('organization').notNull(),
		status: submissionStatusEnum('status').notNull(),
		createdAt: timestamp('created_at').defaultNow(),
		createdBy: varchar('created_by'),
		updatedAt: timestamp('updated_at').defaultNow(),
		updatedBy: varchar('updated_by'),
	},
	(table) => {
		return {
			organizationIndex: index('submission_organization_index').on(table.organization),
			categoryIndex: index('submission_category_index').on(table.dictionaryCategoryId),
			createdByIndex: index('submission_created_by_index').on(table.createdBy),
		};
	},
);

export const submissionRelations = relations(submissions, ({ one, many }) => ({
	dictionary: one(dictionaries, {
		fields: [submissions.dictionaryId],
		references: [dictionaries.id],
	}),
	dictionaryCategory: one(dictionaryCategories, {
		fields: [submissions.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
	submissionFiles: many(submissionFiles),
}));

export type Submission = typeof submissions.$inferSelect; // return type when queried
export type NewSubmission = typeof submissions.$inferInsert; // insert type
