import type { DataRecord } from '@overture-stack/lectern-client';
import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};
