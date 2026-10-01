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

export type InvalidConsequenceRecordReason = {
	reason: 'INVALID_CONSEQUENCE_RECORD';
};

/**
 * Error on a parent record (an `UPDATE` that changes an ID field, or a `DELETE` with dependent `DELETE`s) reporting
 * that one or more of its consequence records (the records whose `parentRecord` references it) are invalid.
 * `invalidRecordIds` lists those records. Their detailed errors are on the consequence records themselves and are not
 * copied here.
 */
export type RecordErrorInvalidConsequence = InvalidConsequenceRecordReason & {
	invalidRecordIds: number[];
	message: string;
};

export type SubmissionRecordError =
	| DictionaryValidationRecordErrorDetails
	| RecordErrorInvalidValue
	| RecordErrorActionConflict
	| RecordErrorInvalidConsequence;

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
		/**
		 * True only on an `UPDATE` whose change touches an ID field (a field referenced by another schema's foreign key).
		 * Such an `UPDATE` records the user's edit. The change itself is represented by the records referencing it
		 * through `parentRecord`.
		 */
		idFieldChange: boolean('id_field_change').notNull().default(false),
		/**
		 * References the parent record this record was staged as a consequence of. Empty on parent records and on records
		 * staged on their own. A parent and its consequence records are one of:
		 * - an `idFieldChange` `UPDATE`, with the `DELETE` of the original record, the `INSERT` of its replacement and the
		 *   foreign key `UPDATE`s of its dependents;
		 * - a `DELETE` staged by deleting a record by its systemId, with the `DELETE`s of the records that depend on it.
		 *
		 * The database deletes a consequence record when its parent is deleted.
		 */
		parentRecord: integer('parent_record_id').references((): AnyPgColumn => submissionRecords.id, {
			onDelete: 'cascade',
		}),
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
			parentRecordIndex: index('submission_records_parent_record_id_index').on(table.parentRecord),
		};
	},
);

export const submissionRecordRelations = relations(submissionRecords, ({ one, many }) => ({
	submissionFile: one(submissionFiles, {
		fields: [submissionRecords.fileId],
		references: [submissionFiles.id],
	}),
	parent: one(submissionRecords, {
		fields: [submissionRecords.parentRecord],
		references: [submissionRecords.id],
		relationName: 'parentRecord',
	}),
	consequenceRecords: many(submissionRecords, { relationName: 'parentRecord' }),
}));

export type SubmissionRecord = typeof submissionRecords.$inferSelect;
export type NewSubmissionRecord = typeof submissionRecords.$inferInsert;
