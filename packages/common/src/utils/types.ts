import { SchemaValidationError } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { DeepReadonly } from 'deep-freeze';
import { TsvRecordAsJsonObj } from './fileUtils.js';

/**
 * Enum matching Submission state in database
 */
export enum SUBMISSION_STATE {
	OPEN = 'OPEN',
	VALID = 'VALID',
	INVALID = 'INVALID',
	CLOSED = 'CLOSED',
	COMMITED = 'COMMITTED',
}

/**
 * Enum used in the Reponse on Create new Submissions
 */
export enum CREATE_SUBMISSION_STATE {
	PROCESSING = 'PROCESSING',
	INVALID_SUBMISSION = 'INVALID_SUBMISSION',
	PARTIAL_SUBMISSION = 'PARTIAL_SUBMISSION',
}

/**
 * Used as a Response type on a Create new Active Submission
 */
export type CreateSubmissionResult = {
	state: CREATE_SUBMISSION_STATE;
	description: string;
	inProcessEntities: string[];
	batchErrors: DeepReadonly<BatchError>[];
};

export type SubmissionEntity = {
	batchName: string;
	creator: string;
	records: ReadonlyArray<TsvRecordAsJsonObj>;
	dataErrors?: SchemaValidationError[];
};

export enum BATCH_ERROR_TYPE {
	INVALID_FILE_EXTENSION = 'INVALID_FILE_EXTENSION',
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
