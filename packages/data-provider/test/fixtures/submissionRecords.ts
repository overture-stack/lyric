import type {
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../src/repository/submissionRecordsRepository.js';

type SubmissionRecordFields = {
	id: number;
	entityName: string;
	fileId?: number;
	idFieldChange?: boolean;
	parentRecord?: number;
};

const baseRecord = ({
	id,
	entityName,
	fileId,
	idFieldChange,
	parentRecord,
}: SubmissionRecordFields): Omit<SubmissionRecordWithEntityName, 'actionType' | 'data'> => ({
	id,
	entityName,
	fileId: fileId ?? 1,
	errors: null,
	idFieldChange: idFieldChange ?? false,
	lineNumber: null,
	parentRecord: parentRecord ?? null,
	state: 'RECEIVED',
});

/** Creates a staged UPDATE Submission Record */
export const createUpdateRecord = (
	fields: SubmissionRecordFields,
	data: SubmissionUpdateData,
): SubmissionRecordWithEntityName => ({ ...baseRecord(fields), actionType: 'UPDATE', data });

/** Creates a staged DELETE Submission Record */
export const createDeleteRecord = (
	fields: SubmissionRecordFields,
	data: SubmissionDeleteData,
): SubmissionRecordWithEntityName => ({ ...baseRecord(fields), actionType: 'DELETE', data });

/** Creates a staged INSERT Submission Record */
export const createInsertRecord = (
	fields: SubmissionRecordFields,
	data: SubmissionInsertData,
): SubmissionRecordWithEntityName => ({ ...baseRecord(fields), actionType: 'INSERT', data });
