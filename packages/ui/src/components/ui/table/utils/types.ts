import { ReactNode } from 'react';

export const SUBMISSION_STATUS = {
	IN_PROGRESS: 'In Progress',
	COMMITED: 'Committed',
} as const;

export type SUBMISSION_STATUS_VALUES = (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];

export interface Submission {
	submissionId: string;
	createdAt: string;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
	studyName: string;
	status: SUBMISSION_STATUS_VALUES;
}
export const COLUMN_NAMES = {
	SUBMISSION_ID: 'submissionId',
	CREATED_AT: 'createdAt',
	CREATED_BY: 'createdBy',
	UPDATED_AT: 'updatedAt',
	UPDATED_BY: 'updatedBy',
	STUDY_NAME: 'studyName',
	STATUS: 'status',
} as const;

export type COLUMN_NAMES_VALUES = (typeof COLUMN_NAMES)[keyof typeof COLUMN_NAMES];

export interface UploadSubmission {
	file: string;
	entity: ReactNode | string;
	record: number | string;
	status: ReactNode | string;
}

export const UPLOAD_COLUMN_NAMES = {
	FILE: 'file',
	ENTITY: 'entity',
	RECORD: 'record',
	STATUS: 'status',
	ACTION: 'action',
} as const;

export type UPLOAD_COLUMN_NAMES_VALUES = (typeof UPLOAD_COLUMN_NAMES)[keyof typeof UPLOAD_COLUMN_NAMES];

export type BatchError = {
	type: string;
	message: string;
	batchName: string;
};

export type NewSubmissionValidationResult = {
	status: string;
	description: string;
	batchErrors: BatchError[];
	fileResults: unknown[];
	inProcessEntities: unknown[];
};
