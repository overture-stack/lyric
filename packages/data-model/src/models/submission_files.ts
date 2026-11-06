import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { submissionRecords } from './submission_records.js';
import { submissions } from './submissions.js';

export const submissionFiles = pgTable(
	'submission_files',
	{
		id: serial('id').primaryKey(),
		submissionId: integer('submission_id')
			.references(() => submissions.id)
			.notNull(),
		fileName: varchar('file_name').notNull(),
		entityName: varchar('entity_name').notNull(),
		fileSize: integer('file_size').notNull(),
		// True when the file holds records the system staged on its own, such as cascading changes to dependent records,
		// rather than records the user submitted. Users can't remove these files; the system removes them once empty.
		isSystemGenerated: boolean('is_system_generated').notNull().default(false),
	},
	(table) => {
		return {
			submissionIndex: index('submission_files_submission_id_index').on(table.submissionId),
			submissionEntityFileIndex: index('submission_files_submission_entity_file_index').on(
				table.submissionId,
				table.entityName,
				table.fileName,
			),
		};
	},
);
export const submissionFileRelations = relations(submissionFiles, ({ one, many }) => ({
	submission: one(submissions, {
		fields: [submissionFiles.submissionId],
		references: [submissions.id],
	}),
	submissionRecords: many(submissionRecords),
}));

export type SubmissionFile = typeof submissionFiles.$inferSelect;
export type NewSubmissionFile = typeof submissionFiles.$inferInsert;
