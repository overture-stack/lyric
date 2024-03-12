import { SchemaValidationError } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { DeepReadonly } from 'deep-freeze';
import { TsvRecordAsJsonObj } from './fileUtils.js';

export enum SUBMISSION_STATE {
	OPEN = 'OPEN',
	VALID = 'VALID',
	INVALID = 'INVALID',
	CLOSED = 'CLOSED',
	COMMITED = 'COMMITED',
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
	entities: Record<string, SubmissionEntity>;
	state: string; //TODO: change to SUBMISSION_STATE
	createdAt?: string;
	createdBy: string;
};

export type SubmissionEntity = {
	batchName: string;
	creator: string;
	records: ReadonlyArray<TsvRecordAsJsonObj>;
	dataErrors?: SchemaValidationError[];
};

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
