import { relations } from 'drizzle-orm';
import { index, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

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
