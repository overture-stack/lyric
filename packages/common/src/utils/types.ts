import { DeepReadonly } from 'deep-freeze';
import { TsvRecordAsJsonObj } from './fileUtils.js';

export enum SUBMISSION_STATE {
	OPEN = 'OPEN',
	VALID = 'VALID',
	INVALID = 'INVALID',
	CLOSED = 'CLOSED',
	COMMITED = 'COMMITTED',
}

/**
 * Used as a Response type on a Create new Active Submission
 */
export type CreateSubmissionResult = {
	readonly successful: boolean;
	readonly submission: CreateActiveSubmission;
	batchErrors: DeepReadonly<BatchError>[];
};

/**
 * Used in the Response on a Create new Active Submission
 */
export type CreateActiveSubmission = {
	id?: string;
	categoryId: string;
	entities: any; //TODO: change to ReadonlyArray<SubmissionEntity>
	state: string; //TODO: change to SUBMISSION_STATE
	createdAt?: string;
	createdBy: string;
};

export type SubmissionEntity = {
	batchName: string;
	creator: string;
	records: ReadonlyArray<TsvRecordAsJsonObj>;
	dataErrors?: ReadonlyArray<ValidationError>;
};

export type ValidationError = {
	fieldName: string;
	info: Object;
	index: number;
	type: SCHEMA_TYPE_ERROR;
};

export enum SCHEMA_TYPE_ERROR {
	MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
	INVALID_FIELD_VALUE_TYPE = 'INVALID_FIELD_VALUE_TYPE',
	INVALID_BY_REGEX = 'INVALID_BY_REGEX',
	INVALID_BY_RANGE = 'INVALID_BY_RANGE',
	INVALID_BY_SCRIPT = 'INVALID_BY_SCRIPT',
	INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',
	UNRECOGNIZED_FIELD = 'UNRECOGNIZED_FIELD',
}

export enum BATCH_ERROR_TYPE {
	TSV_PARSING_FAILED = 'TSV_PARSING_FAILED',
	INVALID_FILE_NAME = 'INVALID_FILE_NAME',
	MULTIPLE_TYPED_FILES = 'MULTIPLE_TYPED_FILES',
	UNRECOGNIZED_HEADER = 'UNRECOGNIZED_HEADER',
	MISSING_REQUIRED_HEADER = 'MISSING_REQUIRED_HEADER',
	INCORRECT_SECTION = 'INCORRECT_SECTION',
}

export type BatchError = {
	message: string;
	type: BATCH_ERROR_TYPE;
	batchName: string;
};

export type DictionaryData = {
	name: string;
	fields: string[];
	description: string;
};
