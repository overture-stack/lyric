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

// GET /submission
export type SchemaEntitySummary = {
	batchName: string;
	recordsCount: number;
};

export type EntitySummaryMap = Record<string, SchemaEntitySummary>;

export type ErrorEntitySummaryMap = Record<string, Pick<SchemaEntitySummary, 'recordsCount'>>;

export type CommitData = {
	deletes: EntitySummaryMap | null;
	inserts: EntitySummaryMap | null;
	updates: EntitySummaryMap | null;
	total: number;
};

export type CommitErrors = {
	deletes: ErrorEntitySummaryMap | null;
	inserts: ErrorEntitySummaryMap | null;
	updates: ErrorEntitySummaryMap | null;
	total: number;
};

export type DictionaryRef = {
	name: string;
	version: string;
};

export type DictionaryCategoryRef = {
	id: number;
	name: string;
};

export type CommitStatus = 'OPEN' | 'VALID' | 'INVALID' | 'CLOSED' | 'COMMITTED';

export type Commit = {
	id: number;
	data: CommitData;
	dictionary: DictionaryRef;
	dictionaryCategory: DictionaryCategoryRef;
	errors: CommitErrors;
	organization: string;
	status: CommitStatus;
	createdAt: string;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};
