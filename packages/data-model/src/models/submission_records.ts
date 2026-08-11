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

export type SubmissionInsertData = DataRecord;

export type SubmissionUpdateData = {
	systemId: string;
	old: DataRecord;
	new: DataRecord;
};

export type SubmissionDeleteData = {
	systemId: string;
	data: DataRecord;
	isValid: boolean;
	organization: string;
};

export type SubmissionData = SubmissionInsertData | SubmissionUpdateData | SubmissionDeleteData;

export type FieldDetails = {
	fieldName: string;
	fieldValue: DataRecordValue;
};

export type UnrecognizedValueReason = {
	reason: 'UNRECOGNIZED_VALUE';
};

export type RecordErrorInvalidValue = FieldDetails & UnrecognizedValueReason;

export type SubmissionRecordError = DictionaryValidationRecordErrorDetails | RecordErrorInvalidValue;

export const submissionRecords = pgTable(
	'submission_records',
	{
		id: serial('id').primaryKey(),
		fileId: integer('file_id')
			.references(() => submissionFiles.id)
			.notNull(),
		data: jsonb('data').$type<SubmissionData>().notNull(),
		actionType: submissionRecordType('action_type').notNull(),
		errors: jsonb('errors').$type<SubmissionRecordError[]>(),
		state: submissionRecordState('state').notNull(),
	},
	(table) => {
		return {
			fileIndex: index('submission_records_file_id_index').on(table.fileId),
			fileActionIndex: index('submission_records_file_id_action_type_index').on(table.fileId, table.actionType),
			fileStateActionIndex: index('submission_records_file_id_state_action_type_index').on(
				table.fileId,
				table.state,
				table.actionType,
			),
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
