import { z as zod } from 'zod';

import type { SubmissionInsertData, SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

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
