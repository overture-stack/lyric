import { z as zod } from 'zod';

import type { DataRecordValue } from '@overture-stack/lectern-client';
import type {
	SubmissionInsertData,
	SubmissionRecordError,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

/** Enum matching the states of submission records in the database. */
export const SUBMISSION_RECORD_STATE = zod.enum(['RECEIVED', 'VALID', 'INVALID']);
export type SubmissionRecordState = zod.infer<typeof SUBMISSION_RECORD_STATE>;

/** Enum matching the action types of submission records in the database. */
export const SUBMISSION_RECORD_ACTION_TYPE = zod.enum(['INSERT', 'UPDATE', 'DELETE']);
export type SubmissionRecordActionType = zod.infer<typeof SUBMISSION_RECORD_ACTION_TYPE>;

export type SubmissionInsertRecordWithEntityName = {
	recordId: number;
	entityName: string;
	data: SubmissionInsertData;
};
export type SubmissionUpdateRecordWithEntityName = {
	recordId: number;
	entityName: string;
	data: SubmissionUpdateData;
};

/**
 * A single Submission Record validation error, normalized to a flat, field-level shape regardless of
 * which underlying error variant (`SubmissionRecordError`) produced it. `fieldName`/`fieldValue` are
 * omitted for error reasons that aren't scoped to a single field (e.g. `CONFLICTING_ACTION`).
 * `restrictionType` (e.g. `'required'`, `'range'`, `'regex'`) is set only when `reason` is
 * `'INVALID_BY_RESTRICTION'`, naming which specific restriction failed. `rowNumber` is the 1-based
 * line number of this record in the file it was uploaded from (`submission_records.line_number`,
 * fixed at parse time); it's omitted for a record with no such line, e.g. one added via a JSON edit
 * rather than a file upload.
 */
export type SubmissionRecordFieldError = {
	rowNumber?: number;
	fieldName?: string;
	fieldValue?: DataRecordValue;
	message: string;
	reason: SubmissionRecordError['reason'];
	restrictionType?: string;
};

/**
 * Count of `SubmissionRecordFieldError`s sharing the same `fieldName`/`reason`/`restrictionType`.
 * `message` is exact for every member of the group when `reason` is `'UNRECOGNIZED_FIELD'` or
 * `'INVALID_BY_RESTRICTION'` (both produce a message independent of the specific invalid value);
 * for every other reason, whose message embeds the offending value, it is only a representative
 * example from the group. `rowNumbers` lists, in ascending order, the file line number of every
 * record that contributed at least one error to this group (a record with no line number, e.g. one
 * added via a JSON edit rather than a file upload, is counted but contributes no entry here).
 */
export type SubmissionErrorFieldReasonCount = {
	fieldName?: string;
	reason: SubmissionRecordError['reason'];
	restrictionType?: string;
	message: string;
	count: number;
	rowNumbers: number[];
};

export type SubmissionErrorsSummary = {
	/** Number of Submission Records for the file that have at least one error. */
	recordsWithErrors: number;
	errorsByFieldAndReason: SubmissionErrorFieldReasonCount[];
};
