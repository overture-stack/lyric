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
 * Summarizes, on an `UPDATE` that changes an ID field (`idFieldChange = true`), that one or more of the records
 * staged as its consequence (`parentRecord` referencing it) are invalid. The detailed errors stay on the
 * consequence records themselves; `invalidRecordIds` identifies them.
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
		 * Such an `UPDATE` is not applied directly; the records referencing it through `parentRecord` apply the change.
		 */
		idFieldChange: boolean('id_field_change').notNull().default(false),
		/**
		 * References the `idFieldChange` `UPDATE` that caused this record to be staged: the `DELETE` of the original
		 * record, the `INSERT` of its replacement, and the foreign key `UPDATE`s of its dependents.
		 * Deleting the parent deletes these records.
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
