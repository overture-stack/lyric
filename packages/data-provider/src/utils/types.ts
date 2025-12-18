import { z } from 'zod';

import {
	type DataRecord,
	type DataRecordValue,
	Dictionary as SchemasDictionary,
	type Schema,
} from '@overture-stack/lectern-client';
import {
	type Category,
	type DataDiff,
	type Dictionary,
	NewSubmittedData,
	Submission,
	SubmissionData,
	type SubmissionDeleteData,
	type SubmissionErrors,
	type SubmissionUpdateData,
	type SubmittedData,
} from '@overture-stack/lyric-data-model/models';

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
 * Enum matching Audit Action in database
 */
export const AUDIT_ACTION = z.enum(['UPDATE', 'DELETE']);
export type AuditAction = z.infer<typeof AUDIT_ACTION>;

/**
 * Audit Raw Data from Repository
 */
export type AuditRepositoryRecord = {
	entityName: string;
	action: AuditAction;
	dataDiff: DataDiff | null;
	newDataIsValid: boolean;
	oldDataIsValid: boolean;
	organization: string;
	submissionId: number;
	systemId: string;
	createdAt: Date | null;
	createdBy: string | null;
};

/**
 * Audit Data Response formatted
 */
export type AuditDataResponse = {
	entityName: string;
	event: AuditAction;
	dataDiff: DataDiff | null;
	newIsValid: boolean;
	oldIsValid: boolean;
	organization: string;
	submissionId: number;
	systemId: string;
	createdAt: string;
	createdBy: string;
};

/**
 * Include an array of the filtered records and a summary of the pagination
 * Response type used to query submitted data endpoint
 */
export type AuditPaginatedResponse = {
	pagination: PaginationMetadata;
	records: AuditDataResponse[];
};

/**
 * Type that describes the options used as a filter on Audit Table
 */
export type AuditFilterOptions = PaginationOptions & {
	entityName?: string;
	eventType?: string;
	startDate?: string;
	endDate?: string;
	systemId?: string;
};

/**
 * Enum used in the Reponse on Create new Submissions
 */
export const CREATE_SUBMISSION_STATUS = {
	PROCESSING: 'PROCESSING',
	INVALID_SUBMISSION: 'INVALID_SUBMISSION',
} as const;
export type CreateSubmissionStatus = ObjectValues<typeof CREATE_SUBMISSION_STATUS>;

/**
 * Used as a Response type on a Create new Active Submission (Upload endpoint)
 */
export type CreateSubmissionResult = {
	submissionId?: number;
	status: CreateSubmissionStatus;
	description: string;
};

/**
 * Response type on Commit Active Submission (Commit endpoint)
 */
export type CommitSubmissionResult = {
	status: string;
	dictionary: object;
	processedEntities: string[];
};

/**
 * Response type on Register new Dictionary
 */
export type RegisterDictionaryResult = {
	categoryId: number;
	categoryName: string;
	dictionary: object;
	name: string;
	version: string;
};

export type { Schema, SchemasDictionary };

/**
 * Enum matching Audit Action in database
 */
export const SUBMISSION_ACTION_TYPE = z.enum(['INSERTS', 'UPDATES', 'DELETES']);
export type SubmissionActionType = z.infer<typeof SUBMISSION_ACTION_TYPE>;

/**
 * File upload validation error types
 */
export const BATCH_ERROR_TYPE = {
	FILE_READ_ERROR: 'FILE_READ_ERROR',
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
	schema: Schema;
	username: string;
}

export interface CommitSubmissionParams {
	dataToValidate: {
		inserts: NewSubmittedData[];
		submittedData: SubmittedData[];
		deletes: SubmissionDeleteData[];
		updates?: Record<string, SubmissionUpdateData>;
	};
	dictionary: SchemasDictionary & { id: number };
	submission: Submission;
	username: string;
	onFinishCommit?: (resultOnCommit: ResultOnCommit) => void;
}

export type EntityData = Record<string, DataRecord[]>;

export type GroupedDataSubmission = {
	submittedDataByEntityName: Record<string, Array<NewSubmittedData | SubmittedData>>;
	schemaDataByEntityName: Record<string, DataRecord[]>;
};

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

export type DataInsertsSubmissionSummary = {
	batchName: string;
	recordsCount: number;
};

export type DataUpdatesSubmissionSummary = {
	recordsCount: number;
};

export type DataDeletesSubmissionSummary = {
	recordsCount: number;
};

export type DataErrorsSubmissionSummary = {
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
 * Response type for Get Submission by Submission ID endpoint
 */
export type SubmissionResponse = {
	id: number;
	data: SubmissionData;
	dictionary: DictionaryActiveSubmission;
	dictionaryCategory: CategoryActiveSubmission;
	errors: SubmissionErrors | null;
	organization: string;
	status: SubmissionStatus | null;
	createdAt: string | null;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};

export type SubmissionDataSummary = {
	inserts?: Record<string, DataInsertsSubmissionSummary>;
	updates?: Record<string, DataUpdatesSubmissionSummary>;
	deletes?: Record<string, DataDeletesSubmissionSummary>;
};

export type SubmissionErrorsSummary = {
	inserts?: Record<string, DataErrorsSubmissionSummary>;
	updates?: Record<string, DataErrorsSubmissionSummary>;
	deletes?: Record<string, DataErrorsSubmissionSummary>;
};

/**
 * Shortened version of the Submission record that omits the data changes and error details
 * in favour of the count of records changed and errors for each entity type.
 */
export type SubmissionSummary = Omit<SubmissionResponse, 'data' | 'errors'> & {
	data: SubmissionDataSummary;
} & {
	errors: SubmissionErrorsSummary;
};

/**
 * Retrieve Submission object with data summary from repository
 */
export type SubmissionSummaryRepositoryRecord = {
	id: number;
	data: SubmissionDataSummary;
	dictionary: Pick<Dictionary, 'name' | 'version'>;
	dictionaryCategory: Pick<Category, 'id' | 'name'>;
	errors: SubmissionErrorsSummary;
	organization: string | null;
	status: SubmissionStatus | null;
	createdAt: Date | null;
	createdBy: string | null;
	updatedAt: Date | null;
	updatedBy: string | null;
};

/**
 * Retrieve Submission object with data summary from repository
 */
export type SubmissionRepositoryRecord = {
	id: number;
	data: SubmissionData;
	dictionary: Pick<Dictionary, 'name' | 'version'>;
	dictionaryCategory: Pick<Category, 'id' | 'name'>;
	errors: SubmissionErrors | null;
	organization: string | null;
	status: SubmissionStatus | null;
	createdAt: Date | null;
	createdBy: string | null;
	updatedAt: Date | null;
	updatedBy: string | null;
};

export type CategoryDetailsResponse = {
	id: number;
	dictionary?: Pick<Dictionary, 'name' | 'version'>;
	name: string;
	organizations: string[];
	createdAt: string;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
};

export type DeleteSubmittedData = {
	systemId: string;
	data: DataRecord;
};

export type FieldNamesByPriorityMap = { required: string[]; optional: string[] };

export type ListAllCategoriesResponse = {
	id: number;
	name: string;
};

/**
 * Submitted Raw Data information
 */
export type SubmittedDataResponse = {
	data: DataRecordNested;
	entityName: string;
	isValid: boolean;
	organization: string;
	systemId: string;
};

/**
 * Result type Post-Commit Submission
 */
export type ResultOnCommit = {
	submissionId: number;
	organization: string;
	categoryId: number;
	data?: {
		inserts: SubmittedDataResponse[];
		updates: SubmittedDataResponse[];
		deletes: SubmittedDataResponse[];
	};
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
 * Type that describes the options used as a filter on Submitted Data
 */
export type SubmittedDataFilterOptions = PaginationOptions & {
	entityName: string;
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
	EDIT_SUBMITTED_DATA: 'editSubmittedData',
	NEW_SUBMITTED_DATA: 'newSubmittedData',
} as const;
export type MergeReferenceType = ObjectValues<typeof MERGE_REFERENCE_TYPE>;

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

export type MutableDataDiff = {
	old: MutableDataRecord;
	new: MutableDataRecord;
};

export type MutableDataRecord = Mutable<DataRecord>;

export interface SubmittedDataReference {
	submittedDataId: number;
	systemId: string;
	type: typeof MERGE_REFERENCE_TYPE.SUBMITTED_DATA;
}

export interface NewSubmittedDataReference {
	index: number;
	submissionId: number;
	type: typeof MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA;
}

export interface EditSubmittedDataReference {
	index: number;
	systemId?: string;
	submissionId: number;
	type: typeof MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA;
}

export type DataRecordReference = {
	dataRecord: DataRecord;
	reference: SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference;
};

export interface DataRecordNested {
	[key: string]: DataRecordValue | DataRecordNested | DataRecordNested[];
}

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

/**
 * Enum matching Schema relationships types
 */
export const SCHEMA_RELATION_TYPE = z.enum(['parent', 'children']);
export type SchemaRelationType = z.infer<typeof SCHEMA_RELATION_TYPE>;

/**
 * Enum matching Schema relationships order types
 */
export const ORDER_TYPE = z.enum(['asc', 'desc']);
export type OrderType = z.infer<typeof ORDER_TYPE>;

/**
 * Enum matching Retrieve data views
 */
export const VIEW_TYPE = z.enum(['flat', 'compound']);
export type ViewType = z.infer<typeof VIEW_TYPE>;
