import type { DataRecord, DictionaryValidationRecordErrorDetails } from '@overture-stack/lectern-client';
import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

/**
 * Creates an error object for invalid value in a batch submission.
 */
export const createInvalidValueBatchError = ({
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
		reason: 'INVALID_BY_RESTRICTION',
		errors: [
			{
				message: 'Value does not match any existing record.',
				restriction: {
					rule: true,
					type: 'required',
				},
			},
		],
	};

	return {
		index,
		...errorDetails,
	};
};

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};
