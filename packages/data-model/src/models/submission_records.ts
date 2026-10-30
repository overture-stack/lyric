import { relations } from 'drizzle-orm';
import { type AnyPgColumn, boolean, index, integer, jsonb, pgEnum, pgTable, serial } from 'drizzle-orm/pg-core';

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

export type ConflictingActionReason = {
	reason: 'CONFLICTING_ACTION';
};

/**
 * Describes a conflict when a record's `systemId` has both an `UPDATE` and a `DELETE` staged in the same Active
 * Submission.
 *
 * The `conflictingActionType` property identifies the other action type involved in the conflict, allowing both
 * sides of the conflict to be reported independently.
 */
export type RecordErrorActionConflict = ConflictingActionReason & {
	systemId: string;
	conflictingActionType: 'UPDATE' | 'DELETE';
	message: string;
};

export type SubmissionRecordError =
	| DictionaryValidationRecordErrorDetails
	| RecordErrorInvalidValue
	| RecordErrorActionConflict;

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
		lineNumber: integer('line_number'),
		// The user's UPDATE or DELETE record that caused the system to stage this record. Removing the parent removes
		// its child records too.
		parentRecordId: integer('parent_record_id').references((): AnyPgColumn => submissionRecords.id, {
			onDelete: 'cascade',
		}),
		// True when the system carries out this record through its child records instead of applying it, such as a
		// user's change to an ID field, carried out as a DELETE and an INSERT. Validation and commit skip this record and
		// use its children; validation reports the children's errors on it.
		appliedByChildren: boolean('applied_by_children').notNull().default(false),
	},
	(table) => {
		return {
			fileIndex: index('submission_records_file_id_index').on(table.fileId),
			parentRecordIndex: index('submission_records_parent_record_id_index').on(table.parentRecordId),
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
