import { relations } from 'drizzle-orm';
import { integer, jsonb, pgEnum, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import {
	type DataRecord,
	SchemaData,
	SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { dictionaries } from './dictionaries.js';
import { dictionaryCategories } from './dictionary_categories.js';

export const submissionStatusEnum = pgEnum('submission_status', ['OPEN', 'VALID', 'INVALID', 'CLOSED', 'COMMITTED']);

export type SubmissionInsertData = {
	batchName: string;
	records: SchemaData;
};

export type SubmissionUpdateData = {
	systemId: string;
	old: DataRecord;
	new: DataRecord;
};

export type SubmissionDeleteData = {
	systemId: string;
	data: DataRecord;
};

export type SubmissionData = {
	inserts?: Record<string, SubmissionInsertData>;
	updates?: Record<string, SubmissionUpdateData[]>;
	deletes?: Record<string, SubmissionDeleteData[]>;
};

export const submissions = pgTable('submissions', {
	id: serial('id').primaryKey(),
	data: jsonb('data').$type<SubmissionData>().notNull(),
	dictionaryCategoryId: integer('dictionary_category_id')
		.references(() => dictionaryCategories.id)
		.notNull(),
	dictionaryId: integer('dictionary_id')
		.references(() => dictionaries.id)
		.notNull(),
	errors: jsonb('errors').$type<Record<string, SchemaValidationError[]>>(),
	organization: varchar('organization').notNull(),
	status: submissionStatusEnum('status').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	createdBy: varchar('created_by'),
	updatedAt: timestamp('updated_at').defaultNow(),
	updatedBy: varchar('updated_by'),
});

export const submissionRelations = relations(submissions, ({ one }) => ({
	dictionary: one(dictionaries, {
		fields: [submissions.dictionaryId],
		references: [dictionaries.id],
	}),
	dictionaryCategory: one(dictionaryCategories, {
		fields: [submissions.dictionaryCategoryId],
		references: [dictionaryCategories.id],
	}),
}));

export type Submission = typeof submissions.$inferSelect; // return type when queried
export type NewSubmission = typeof submissions.$inferInsert; // insert type
