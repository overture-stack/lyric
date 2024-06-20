import { NewSubmittedData, Submission, SubmissionData } from '@overture-stack/lyric-data-model';
import {
	DataRecord,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
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
 * Used as a Response type on a Create new Active Submission (Upload endpoint)
 */
export type CreateSubmissionResult = {
	submissionId?: number;
	status: CreateSubmissionStatus;
	description: string;
	inProcessEntities: string[];
	batchErrors: DeepReadonly<BatchError>[];
};

/**
 * Response type on Commit Active Submission (Commit endpoint)
 */
export type CommitSubmissionResult = {
	status: string;
	dictionary: {};
	processedEntities: string[];
};

/**
 * File upload validation error types
 */
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
	organization: string;
	userName: string;
}

export interface CommitSubmissionParams {
	data: Array<NewSubmittedData>;
	dictionary: SchemasDictionary & { id: number };
	submission: Submission;
}

export type BooleanTrueObject = {
	[key: string]: true;
};

/**
 * Pagination Query Params
 */
export type PaginationOptions = {
	page: number;
	pageSize: number;
};

export type DataActiveSubmissionSummary = {
	batchName: string;
	creator: string;
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

/**
 * Response type for Get Active Submission by Submission ID endpoint
 */
export type ActiveSubmissionResponse = {
	id: number;
	data: Record<string, SubmissionData>;
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

/**
 * Response type of Get Active Submission by Organization Endpoint
 * override 'data' object to contain a summary of records
 */
export type ActiveSubmissionSummaryResponse = Omit<ActiveSubmissionResponse, 'data'> & {
	data: Record<string, DataActiveSubmissionSummary>;
};

/**
 * Retrieve Active Submission object from repository
 */
export type ActiveSubmissionSummaryRepository = {
	id: number;
	data: Record<string, SubmissionData>;
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

/**
 * Submitted Raw Data information
 */
export type SubmittedDataResponse = {
	data: DataRecord;
	entityName: string;
	isValid: boolean;
	organization: string;
	systemId: string;
};

/**
 * Pagination Summary Information
 * Provides details about the result of pagination
 */
export type PaginationMetadata = {
	currentPage: number;
	pageSize: number;
	totalPages: number;
	totalRecords: number;
};

/**
 * Include an array of the filtered records and a summary of the pagination
 * Response type used to query submitted data endpoint
 */
export type SubmittedDataPaginatedResponse = {
	pagination: PaginationMetadata;
	records: SubmittedDataResponse[];
};

/**
 * Enum used to merge SubmittedData and Submissions
 */
export const MERGE_REFERENCE_TYPE = {
	SUBMITTED_DATA: 'submittedData',
	SUBMISSION: 'submission',
} as const;
export type MergeReferenceType = ObjectValues<typeof MERGE_REFERENCE_TYPE>;

export interface SubmittedDataReference {
	type: typeof MERGE_REFERENCE_TYPE.SUBMITTED_DATA;
	submittedDataId: number;
}

export interface SubmissionReference {
	type: typeof MERGE_REFERENCE_TYPE.SUBMISSION;
	submissionId: number | undefined;
	index: number;
}

export type DataRecordReference = {
	dataRecord: DataRecord;
	reference: SubmittedDataReference | SubmissionReference;
};

/**
 * Keys of an object type as a union
 *
 * Example:
 * ```
 * const model = { a: 'hello', b: 100};
 * type ModelKeys = Keys<typeof model>; // "a" | "b"
 * ```
 */
export type Keys<T> = T extends infer U ? keyof U : never;

/**
 * Values of an object's property types as a union.
 * If the object is readonly (ie. `as const`) the values will be read as literals
 *
 * Example:
 * ```
 * const model = { a: 'hello', b: 100};
 * type ModelValues = Values<typeof model>; // string | number
 *
 * const modelAsConst = { a: 'hello', b: 100} as const;
 * type ModelAsConstValues = Values<typeof modelAsConst>; // 'hello' | 100
 * ```
 */
export type Values<T> = T extends infer U ? U[keyof U] : never;

/**
 * Strip out aliases from the TS reported type, to one level.
 * This will display type as an object with key: value pairs instead as an alias name.
 */
export type Clean<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
