import {
	DataRecord,
	SchemasDictionary,
	SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { NewSubmittedData, Submission } from 'data-model';
import { DeepReadonly } from 'deep-freeze';

type ObjectValues<T> = T[keyof T];

/**
 * Enum matching Submission status in database
 */
export const SUBMISSION_STATUS = {
	OPEN: 'OPEN',
	VALID: 'VALID',
	INVALID: 'INVALID',
	CLOSED: 'CLOSED',
	COMMITED: 'COMMITTED',
} as const;
export type SubmissionStatus = ObjectValues<typeof SUBMISSION_STATUS>;

/**
 * Enum used in the Reponse on Create new Submissions
 */
export const CREATE_SUBMISSION_STATUS = {
	PROCESSING: 'PROCESSING',
	INVALID_SUBMISSION: 'INVALID_SUBMISSION',
	PARTIAL_SUBMISSION: 'PARTIAL_SUBMISSION',
} as const;
export type CreateSubmissionStatus = ObjectValues<typeof CREATE_SUBMISSION_STATUS>;

/**
 * Used as a Response type on a Create new Active Submission
 */
export type CreateSubmissionResult = {
	status: CreateSubmissionStatus;
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
	status: SubmissionStatus | null;
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
	status: SubmissionStatus | null;
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
	status: SubmissionStatus | null;
	createdAt: string | null;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};
