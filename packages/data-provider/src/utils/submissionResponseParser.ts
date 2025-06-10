import * as _ from 'lodash-es';

import type { DataRecord } from '@overture-stack/lectern-client';
import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

import type {
	DataDeletesSubmissionSummary,
	DataInsertsSubmissionSummary,
	DataUpdatesSubmissionSummary,
	SubmissionResponse,
	SubmissionSummaryRepository,
	SubmissionSummaryResponse,
} from './types.js';

export const createBatchResponse = (schemaName: string, records: DataRecord[]): SubmissionInsertData => {
	return { batchName: schemaName, records };
};

/**
 * Utility to parse a raw Submission to a Response type
 * @param {SubmissionSummaryRepository} submission
 * @returns {SubmissionResponse}
 */
export const parseSubmissionDetailsResponse = (submission: SubmissionSummaryRepository): SubmissionResponse => {
	return {
		id: submission.id,
		data: submission.data,
		dictionary: submission.dictionary,
		dictionaryCategory: submission.dictionaryCategory,
		errors: submission.errors,
		organization: _.toString(submission.organization),
		status: submission.status,
		createdAt: _.toString(submission.createdAt?.toISOString()),
		createdBy: _.toString(submission.createdBy),
		updatedAt: _.toString(submission.updatedAt?.toISOString()),
		updatedBy: _.toString(submission.updatedBy),
	};
};

/**
 * Utility to parse a raw Submission to a Summary of the Submission
 * @param {SubmissionSummaryRepository} submission
 * @returns {SubmissionSummaryResponse}
 */
export const parseSubmissionSummaryResponse = (submission: SubmissionSummaryRepository): SubmissionSummaryResponse => {
	const dataInsertsSummary =
		submission.data?.inserts &&
		Object.entries(submission.data?.inserts).reduce<Record<string, DataInsertsSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { ..._.omit(entityData, 'records'), recordsCount: entityData.records.length };
				return acc;
			},
			{},
		);

	const dataUpdatesSummary =
		submission.data.updates &&
		Object.entries(submission.data?.updates).reduce<Record<string, DataUpdatesSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { recordsCount: entityData.length };
				return acc;
			},
			{},
		);

	const dataDeletesSummary =
		submission.data.deletes &&
		Object.entries(submission.data?.deletes).reduce<Record<string, DataDeletesSubmissionSummary>>(
			(acc, [entityName, entityData]) => {
				acc[entityName] = { recordsCount: entityData.length };
				return acc;
			},
			{},
		);

	return {
		id: submission.id,
		data: { inserts: dataInsertsSummary, updates: dataUpdatesSummary, deletes: dataDeletesSummary },
		dictionary: submission.dictionary,
		dictionaryCategory: submission.dictionaryCategory,
		errors: submission.errors,
		organization: _.toString(submission.organization),
		status: submission.status,
		createdAt: _.toString(submission.createdAt?.toISOString()),
		createdBy: _.toString(submission.createdBy),
		updatedAt: _.toString(submission.updatedAt?.toISOString()),
		updatedBy: _.toString(submission.updatedBy),
	};
};
