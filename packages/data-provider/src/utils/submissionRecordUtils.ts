import {
	type RecordErrorActionConflict,
	type SubmissionDeleteData,
	type SubmissionInsertData,
	type SubmissionRecordError,
	type SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../repository/submissionRecordsRepository.js';
import type { SubmissionInsertRecordWithEntityName, SubmissionUpdateRecordWithEntityName } from './submissionTypes.js';
import { SUBMISSION_RECORD_ACTION_TYPE } from './submissionTypes.js';

type SubmissionRecordErrorDetails = {
	recordId: number;
	errors: SubmissionRecordError[];
};

export type SubmissionErrors = {
	inserts?: Record<string, SubmissionRecordErrorDetails[]>;
	updates?: Record<string, SubmissionRecordErrorDetails[]>;
	deletes?: Record<string, SubmissionRecordErrorDetails[]>;
};

export const isUpdateSubmissionRecord = (
	item: SubmissionRecordWithEntityName,
): item is SubmissionRecordWithEntityName & {
	actionType: typeof SUBMISSION_RECORD_ACTION_TYPE.Values.UPDATE;
	data: SubmissionUpdateData;
} => item.actionType === SUBMISSION_RECORD_ACTION_TYPE.Values.UPDATE;

export const isInsertSubmissionRecord = (
	item: SubmissionRecordWithEntityName,
): item is SubmissionRecordWithEntityName & {
	actionType: typeof SUBMISSION_RECORD_ACTION_TYPE.Values.INSERT;
	data: SubmissionInsertData;
} => item.actionType === SUBMISSION_RECORD_ACTION_TYPE.Values.INSERT;

export const isDeleteSubmissionRecord = (
	item: SubmissionRecordWithEntityName,
): item is SubmissionRecordWithEntityName & {
	actionType: typeof SUBMISSION_RECORD_ACTION_TYPE.Values.DELETE;
	data: SubmissionDeleteData;
} => item.actionType === SUBMISSION_RECORD_ACTION_TYPE.Values.DELETE;

export const createSubmissionUpdateRecords = (
	submissionData: SubmissionRecordWithEntityName[],
): SubmissionUpdateRecordWithEntityName[] => {
	return submissionData.reduce<SubmissionUpdateRecordWithEntityName[]>((acc, item) => {
		if (isUpdateSubmissionRecord(item)) {
			acc.push({
				recordId: item.id,
				entityName: item.entityName,
				data: item.data,
			});
		}
		return acc;
	}, []);
};

export const createSubmissionInsertRecords = (
	submissionData: SubmissionRecordWithEntityName[],
): SubmissionInsertRecordWithEntityName[] => {
	return submissionData.reduce<SubmissionInsertRecordWithEntityName[]>((acc, item) => {
		if (isInsertSubmissionRecord(item)) {
			acc.push({
				recordId: item.id,
				entityName: item.entityName,
				data: item.data,
			});
		}
		return acc;
	}, []);
};

/**
 * Finds entity-scoped system IDs that have both an `UPDATE` and a `DELETE` record staged in the Active Submission.
 *
 * This check runs before dictionary validation so both conflicting records can be rejected explicitly instead of
 * allowing one action to silently override the other during the validation or merge process.
 *
 * @param submissionData - The Active Submission records to inspect.
 * @returns Conflict errors grouped by entity name under the `updates` and `deletes` buckets.
 */
export const findUpdateDeleteConflicts = (submissionData: SubmissionRecordWithEntityName[]): SubmissionErrors => {
	const updatesByEntity = new Map<string, Map<string, number[]>>();
	const deletesByEntity = new Map<string, Map<string, number[]>>();

	const trackRecordId = (
		bucket: Map<string, Map<string, number[]>>,
		entityName: string,
		systemId: string,
		recordId: number,
	) => {
		const bySystemId = bucket.get(entityName) ?? new Map<string, number[]>();
		bySystemId.set(systemId, [...(bySystemId.get(systemId) ?? []), recordId]);
		bucket.set(entityName, bySystemId);
	};

	submissionData.forEach((record) => {
		if (isUpdateSubmissionRecord(record)) {
			trackRecordId(updatesByEntity, record.entityName, record.data.systemId, record.id);
		} else if (isDeleteSubmissionRecord(record)) {
			trackRecordId(deletesByEntity, record.entityName, record.data.systemId, record.id);
		}
	});

	const conflictErrorFor = (
		systemId: string,
		conflictingActionType: RecordErrorActionConflict['conflictingActionType'],
	): RecordErrorActionConflict => ({
		reason: 'CONFLICTING_ACTION',
		systemId,
		conflictingActionType,
		message: `Record with systemId '${systemId}' has both an UPDATE and a DELETE staged in the same Active Submission`,
	});

	const conflictErrors: SubmissionErrors = {};

	updatesByEntity.forEach((updateSystemIds, entityName) => {
		const deleteSystemIds = deletesByEntity.get(entityName);
		if (!deleteSystemIds) {
			return;
		}

		updateSystemIds.forEach((updateRecordIds, systemId) => {
			const deleteRecordIds = deleteSystemIds.get(systemId);
			if (!deleteRecordIds) {
				return;
			}

			conflictErrors.updates ??= {};
			conflictErrors.updates[entityName] = [
				...(conflictErrors.updates[entityName] ?? []),
				...updateRecordIds.map((recordId) => ({ recordId, errors: [conflictErrorFor(systemId, 'DELETE')] })),
			];

			conflictErrors.deletes ??= {};
			conflictErrors.deletes[entityName] = [
				...(conflictErrors.deletes[entityName] ?? []),
				...deleteRecordIds.map((recordId) => ({ recordId, errors: [conflictErrorFor(systemId, 'UPDATE')] })),
			];
		});
	});

	return conflictErrors;
};

/**
 * Represents the result of resolving conflicts when staging delete records in an Active Submission.
 */
type DeleteStagingConflictResolution = {
	/** `recordsToDeleteMap` with systemIds that already have a pending DELETE removed, so they aren't staged twice */
	filteredRecordsToDeleteMap: Record<string, SubmissionDeleteData[]>;
	/** systemIds that already have a pending UPDATE staged for the same entity in the Active Submission */
	conflictingSystemIds: string[];
	/** systemIds that already have a pending DELETE staged for the same entity — skipped instead of duplicated */
	duplicateSystemIds: string[];
};

/**
 * Resolves conflicts between deletes being staged and records already pending in the Active Submission.
 *
 * A system ID with a pending `UPDATE` is reported as a conflict so the caller can reject the delete instead of
 * allowing one action to override the other. A system ID with a pending `DELETE` is treated as a duplicate and
 * removed from the result, preventing a second delete record from being inserted.
 *
 * @param recordsToDeleteMap - New delete records grouped by entity name.
 * @param existingSubmissionRecords - The Active Submission's existing `UPDATE` and `DELETE` records.
 * @returns The delete records to stage, along with conflicting and duplicate system IDs.
 */
export const resolveDeleteStagingConflicts = (
	recordsToDeleteMap: Record<string, SubmissionDeleteData[]>,
	existingSubmissionRecords: SubmissionRecordWithEntityName[],
): DeleteStagingConflictResolution => {
	const existingUpdateSystemIds = new Map<string, Set<string>>();
	const existingDeleteSystemIds = new Map<string, Set<string>>();

	const trackSystemId = (bucket: Map<string, Set<string>>, entityName: string, systemId: string) => {
		const systemIds = bucket.get(entityName) ?? new Set<string>();
		systemIds.add(systemId);
		bucket.set(entityName, systemIds);
	};

	existingSubmissionRecords.forEach((record) => {
		if (isUpdateSubmissionRecord(record)) {
			trackSystemId(existingUpdateSystemIds, record.entityName, record.data.systemId);
		} else if (isDeleteSubmissionRecord(record)) {
			trackSystemId(existingDeleteSystemIds, record.entityName, record.data.systemId);
		}
	});

	const conflictingSystemIds: string[] = [];
	const duplicateSystemIds: string[] = [];
	const filteredRecordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {};

	Object.entries(recordsToDeleteMap).forEach(([entityName, records]) => {
		const conflictingUpdateIds = existingUpdateSystemIds.get(entityName);
		const duplicateDeleteIds = existingDeleteSystemIds.get(entityName);

		const recordsToKeep = records.filter((record) => {
			if (conflictingUpdateIds?.has(record.systemId)) {
				conflictingSystemIds.push(record.systemId);
				return false;
			}
			if (duplicateDeleteIds?.has(record.systemId)) {
				duplicateSystemIds.push(record.systemId);
				return false;
			}
			return true;
		});

		if (recordsToKeep.length > 0) {
			filteredRecordsToDeleteMap[entityName] = recordsToKeep;
		}
	});

	return { filteredRecordsToDeleteMap, conflictingSystemIds, duplicateSystemIds };
};

/**
 * Collects every `recordId` referenced across all buckets of a `SubmissionErrors` object.
 * @param {SubmissionErrors} errors
 * @returns {Set<number>}
 */
export const extractRecordIdsFromSubmissionErrors = (errors: SubmissionErrors): Set<number> => {
	const recordIds = new Set<number>();
	for (const entities of Object.values(errors)) {
		if (!entities) {
			continue;
		}
		for (const records of Object.values(entities)) {
			records.forEach(({ recordId }) => recordIds.add(recordId));
		}
	}
	return recordIds;
};

/**
 * Merges two `SubmissionErrors` objects by concatenating error arrays for matching entities within each action bucket.
 *
 * Existing errors are preserved instead of being overwritten. Empty action buckets are omitted from the result.
 *
 * @param existingErrors - The existing submission errors.
 * @param additionalErrors - Additional submission errors to merge.
 * @returns The combined submission errors.
 */
export const mergeSubmissionErrors = (
	existingErrors: SubmissionErrors,
	additionalErrors: SubmissionErrors,
): SubmissionErrors => {
	const mergeBucket = (
		bucketA?: Record<string, SubmissionRecordErrorDetails[]>,
		bucketB?: Record<string, SubmissionRecordErrorDetails[]>,
	): Record<string, SubmissionRecordErrorDetails[]> | undefined => {
		if (!bucketA && !bucketB) {
			return undefined;
		}
		const merged: Record<string, SubmissionRecordErrorDetails[]> = { ...bucketA };
		for (const [entityName, records] of Object.entries(bucketB ?? {})) {
			merged[entityName] = [...(merged[entityName] ?? []), ...records];
		}
		return merged;
	};

	// Only set a bucket key when it actually has content — callers rely on `Object.keys(...).length`
	// (and `_.isEmpty`) to detect the "no errors" case, so an always-present `undefined` value would
	// make every submission look like it has errors.
	const merged: SubmissionErrors = {};
	const inserts = mergeBucket(existingErrors.inserts, additionalErrors.inserts);
	if (inserts) {
		merged.inserts = inserts;
	}
	const updates = mergeBucket(existingErrors.updates, additionalErrors.updates);
	if (updates) {
		merged.updates = updates;
	}
	const deletes = mergeBucket(existingErrors.deletes, additionalErrors.deletes);
	if (deletes) {
		merged.deletes = deletes;
	}
	return merged;
};
