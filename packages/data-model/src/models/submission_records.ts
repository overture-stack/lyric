import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, serial } from 'drizzle-orm/pg-core';

import {
	type DataRecord,
	type DataRecordValue,
	type DictionaryValidationRecordErrorDetails,
} from '@overture-stack/lectern-client';

import { submissionFiles } from './submission_files.js';

export const submissionRecordState = pgEnum('submission_record_state', ['RECEIVED', 'VALID', 'INVALID']);

export const submissionRecordType = pgEnum('submission_record_type', ['INSERT', 'UPDATE', 'DELETE']);

// TODO: export this type
type SubmissionInsertData = DataRecord;

// TODO: export this type
type SubmissionUpdateData = {
	systemId: string;
	old: DataRecord;
	new: DataRecord;
};

// TODO: export this type
type SubmissionDeleteData = {
	systemId: string;
	data: DataRecord;
	isValid: boolean;
	organization: string;
};

// TODO: export this type
type SubmissionData = SubmissionInsertData | SubmissionUpdateData | SubmissionDeleteData;

// TODO: export this type
type FieldDetails = {
	fieldName: string;
	fieldValue: DataRecordValue;
};

// TODO: export this type
type UnrecognizedValueReason = {
	reason: 'UNRECOGNIZED_VALUE';
};

// TODO: export this type
type RecordErrorInvalidValue = FieldDetails & UnrecognizedValueReason;

// TODO: export this type
type SubmissionRecordErrors = (DictionaryValidationRecordErrorDetails | RecordErrorInvalidValue)[];

export const submissionRecords = pgTable(
	'submission_records',
	{
		id: serial('id').primaryKey(),
		fileId: integer('file_id')
			.references(() => submissionFiles.id)
			.notNull(),
		data: jsonb('data').$type<SubmissionData>().notNull(),
		actionType: submissionRecordType('action_type').notNull(),
		errors: jsonb('errors').$type<SubmissionRecordErrors>(),
		state: submissionRecordState('state').notNull(),
	},
	(table) => {
		return {
			fileIndex: index('submission_records_file_id_index').on(table.fileId),
		};
	},
);

export const submissionRecordRelations = relations(submissionRecords, ({ one }) => ({
	submissionFile: one(submissionFiles, {
		fields: [submissionRecords.fileId],
		references: [submissionFiles.id],
	}),
}));

export type SubmissionRecord = typeof submissionRecords.$inferSelect;
export type NewSubmissionRecord = typeof submissionRecords.$inferInsert;
