import {
	DataRecord,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { DeepReadonly } from 'deep-freeze';
import { Submission } from '../models/submissions.js';
import { NewSubmittedData } from '../models/submitted_data.js';

type ObjectValues<T> = T[keyof T];

/**
 * Enum matching Submission state in database
 */
export const SUBMISSION_STATE = {
	OPEN: 'OPEN',
	VALID: 'VALID',
	INVALID: 'INVALID',
	CLOSED: 'CLOSED',
	COMMITED: 'COMMITTED',
} as const;
export type SubmissionState = ObjectValues<typeof SUBMISSION_STATE>;

/**
 * Enum used in the Reponse on Create new Submissions
 */
export const CREATE_SUBMISSION_STATE = {
	PROCESSING: 'PROCESSING',
	INVALID_SUBMISSION: 'INVALID_SUBMISSION',
	PARTIAL_SUBMISSION: 'PARTIAL_SUBMISSION',
} as const;
export type CreateSubmissionState = ObjectValues<typeof CREATE_SUBMISSION_STATE>;

/**
 * Used as a Response type on a Create new Active Submission
 */
export type CreateSubmissionResult = {
	state: CreateSubmissionState;
	description: string;
	inProcessEntities: string[];
	batchErrors: DeepReadonly<BatchError>[];
};

export type CommitSubmissionResult = {
	status: string;
	dictionary: {};
	processedEntities: string[];
};

export type SubmissionEntity = {
	batchName: string;
	creator: string;
	records: ReadonlyArray<DataRecord>;
	dataErrors?: SchemaValidationError[];
};

export const BATCH_ERROR_TYPE = {
	INVALID_FILE_EXTENSION: 'INVALID_FILE_EXTENSION',
	TSV_PARSING_FAILED: 'TSV_PARSING_FAILED',
	INVALID_FILE_NAME: 'INVALID_FILE_NAME',
	MULTIPLE_TYPED_FILES: 'MULTIPLE_TYPED_FILES',
	UNRECOGNIZED_HEADER: 'UNRECOGNIZED_HEADER',
	MISSING_REQUIRED_HEADER: 'MISSING_REQUIRED_HEADER',
	INCORRECT_SECTION: 'INCORRECT_SECTION',
} as const;

export type BatchErrorType = ObjectValues<typeof BATCH_ERROR_TYPE>;

export type BatchError = {
	message: string;
	type: BatchErrorType;
	batchName: string;
};

export interface ValidateFilesParams {
	categoryId: number;
	currentDictionaryId: number;
	organization: string;
	userName: string;
	schemasDictionary: SchemasDictionary;
}

export interface CommitSubmissionParams {
	data: Array<NewSubmittedData>;
	dictionary: SchemasDictionary & { id: number };
	submission: Submission;
}

export type BooleanTrueObject = {
	[key: string]: true;
};

export type DataActiveSubmissionSummary = {
	batchName: string;
	creator: string;
	dataErrors?: SchemaValidationError[];
	recordsCount: number;
};

export type DictionaryActiveSubmission = {
	name: string;
	version: string;
};

export type CategoryActiveSubmission = {
	id: number;
	name: string;
};

export type ActiveSubmissionSummaryResponse = {
	id: number;
	data: Record<string, DataActiveSubmissionSummary>;
	dictionary: DictionaryActiveSubmission | null;
	dictionaryCategory: CategoryActiveSubmission | null;
	errors: Record<string, SchemaValidationError[]> | null;
	organization: string;
	state: SubmissionState | null;
	createdAt: string | null;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};

export type ActiveSubmissionSummaryRepository = {
	id: number;
	data: Record<string, SubmissionEntity>;
	dictionary: {} | null;
	dictionaryCategory: {} | null;
	errors: Record<string, SchemaValidationError[]> | null;
	organization: string | null;
	state: SubmissionState | null;
	createdAt: Date | null;
	createdBy: string | null;
	updatedAt: Date | null;
	updatedBy: string | null;
};

export type ActiveSubmissionResponse = {
	id: number;
	data: Record<string, SubmissionEntity>;
	dictionary: DictionaryActiveSubmission | null;
	dictionaryCategory: CategoryActiveSubmission | null;
	errors: Record<string, SchemaValidationError[]> | null;
	organization: string;
	state: SubmissionState | null;
	createdAt: string | null;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};
