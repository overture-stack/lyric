import type { DataRecord, DictionaryValidationRecordErrorDetails } from '@overture-stack/lectern-client';
import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

/**
 * Creates an error object for unrecognized fields in a batch submission.
 */
export const createUnrecognizedFieldBatchError = ({
	fieldName,
	fieldValue,
	index,
}: {
	fieldName: string;
	fieldValue: string;
	index: number;
}) => {
	const errorDetails: DictionaryValidationRecordErrorDetails = {
		fieldName,
		fieldValue,
		reason: 'UNRECOGNIZED_FIELD',
	};

	return {
		index,
		...errorDetails,
	};
};

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};
