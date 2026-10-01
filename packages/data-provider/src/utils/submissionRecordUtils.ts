import {
	type RecordErrorActionConflict,
	type RecordErrorInvalidConsequence,
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

/**
 * Returns the identifier of the group a Submission Record belongs to. A record staged as the consequence of an
 * `idFieldChange` UPDATE belongs to that UPDATE's group; any other record is its own group.
 */
const getRecordGroupId = (record: Pick<SubmissionRecordWithEntityName, 'id' | 'parentRecord'>): number =>
	record.parentRecord ?? record.id;

/**
 * Collects the `UPDATE` records to apply on top of the Submitted Data.
 *
 * An `UPDATE` with `idFieldChange` is excluded: it is not applied itself, its consequence records (the `DELETE` of the
 * original record, the `INSERT` of the replacement and the dependents' foreign key `UPDATE`s) apply the change.
 * Applying it as well would apply the change twice.
 */
export const createSubmissionUpdateRecords = (
	submissionData: SubmissionRecordWithEntityName[],
): SubmissionUpdateRecordWithEntityName[] => {
	return submissionData.reduce<SubmissionUpdateRecordWithEntityName[]>((acc, item) => {
		if (isUpdateSubmissionRecord(item) && !item.idFieldChange) {
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
 * An `UPDATE` and a `DELETE` of the same group are not a conflict: an `idFieldChange` UPDATE is staged together with
 * the `DELETE` of the record it changes, which references it through `parentRecord`. That parent `UPDATE` together
 * with a `DELETE` staged independently (without `parentRecord`) is still a conflict.
 *
 * @param submissionData - The Active Submission records to inspect.
 * @returns Conflict errors grouped by entity name under the `updates` and `deletes` buckets.
 */
export const findUpdateDeleteConflicts = (submissionData: SubmissionRecordWithEntityName[]): SubmissionErrors => {
	type TrackedRecord = { recordId: number; groupId: number };
	const updatesByEntity = new Map<string, Map<string, TrackedRecord[]>>();
	const deletesByEntity = new Map<string, Map<string, TrackedRecord[]>>();

	const trackRecord = (
		bucket: Map<string, Map<string, TrackedRecord[]>>,
		entityName: string,
		systemId: string,
		record: SubmissionRecordWithEntityName,
	): void => {
		const bySystemId = bucket.get(entityName) ?? new Map<string, TrackedRecord[]>();
		bySystemId.set(systemId, [
			...(bySystemId.get(systemId) ?? []),
			{ recordId: record.id, groupId: getRecordGroupId(record) },
		]);
		bucket.set(entityName, bySystemId);
	};

	submissionData.forEach((record) => {
		if (isUpdateSubmissionRecord(record)) {
			trackRecord(updatesByEntity, record.entityName, record.data.systemId, record);
		} else if (isDeleteSubmissionRecord(record)) {
			trackRecord(deletesByEntity, record.entityName, record.data.systemId, record);
		}
	});

	// A record conflicts when the other action type has a record on the same systemId from a different group
	const findConflictingRecordIds = (records: TrackedRecord[], otherRecords: TrackedRecord[]): number[] =>
		records
			.filter((record) => otherRecords.some((otherRecord) => otherRecord.groupId !== record.groupId))
			.map((record) => record.recordId);

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

		updateSystemIds.forEach((updateRecords, systemId) => {
			const deleteRecords = deleteSystemIds.get(systemId);
			if (!deleteRecords) {
				return;
			}

			const updateRecordIds = findConflictingRecordIds(updateRecords, deleteRecords);
			const deleteRecordIds = findConflictingRecordIds(deleteRecords, updateRecords);
			if (updateRecordIds.length === 0 && deleteRecordIds.length === 0) {
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
 * allowing one action to override the other. This includes an `idFieldChange` UPDATE and the foreign key `UPDATE`s
 * staged as its consequence, matching how `findUpdateDeleteConflicts` treats them at validation time.
 * A system ID with a pending independent `DELETE` is treated as a duplicate and removed from the result, preventing a
 * second delete record from being inserted. A `DELETE` staged as the consequence of an `idFieldChange` UPDATE (with
 * `parentRecord` set) is not counted as a duplicate: it is removed whenever its parent is, so it cannot stand in for
 * the requested delete. Its parent `UPDATE` already makes the system ID a conflict.
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
		} else if (isDeleteSubmissionRecord(record) && !record.parentRecord) {
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

/** Identifies a Submitted Data record targeted by an edit, scoped to its entity. */
export type EditStagingKey = {
	entityName: string;
	systemId: string;
};

/**
 * Represents the result of resolving conflicts when staging edits in an Active Submission.
 */
type EditStagingConflictResolution = {
	/** IDs of staged `UPDATE`s replaced by the incoming edits. Deleting them also deletes their consequence records */
	supersededRecordIds: number[];
	/** systemIds where an incoming edit collides with a foreign key `UPDATE` cascaded from an ID field change */
	conflictingSystemIds: string[];
};

/**
 * Resolves the incoming edits of an edit request against the `UPDATE`s already staged in the Active Submission, so
 * that each systemId has at most one staged `UPDATE` per entity.
 *
 * - A direct edit replaces the `UPDATE` staged directly for the same systemId (a plain edit or an `idFieldChange`
 *   UPDATE). Its ID is returned in `supersededRecordIds`; deleting it also deletes its consequence records.
 * - A direct edit of a systemId that has a cascaded foreign key `UPDATE` staged (one with `parentRecord` set) is a
 *   conflict. Replacing the cascaded `UPDATE` would undo the foreign key change it applies.
 * - A cascaded `UPDATE` is a conflict when its systemId has any `UPDATE` staged that is not removed along with a
 *   superseded record, when it collides with a direct edit of the same request, or when two edits of the request
 *   cascade to the same systemId.
 *
 * @param params.directEditKeys - Records targeted by the request's direct edits, including edits without changes.
 * @param params.cascadeUpdateKeys - Records targeted by the foreign key `UPDATE`s cascaded from the request's ID
 * field changes.
 * @param params.existingSubmissionRecords - The Active Submission's staged records. Only `UPDATE`s are considered.
 * @returns The staged records to replace and the systemIds that conflict.
 */
export const resolveEditStagingConflicts = ({
	directEditKeys,
	cascadeUpdateKeys,
	existingSubmissionRecords,
}: {
	directEditKeys: EditStagingKey[];
	cascadeUpdateKeys: EditStagingKey[];
	existingSubmissionRecords: SubmissionRecordWithEntityName[];
}): EditStagingConflictResolution => {
	const toKey = ({ entityName, systemId }: EditStagingKey): string => JSON.stringify([entityName, systemId]);

	const directKeys = new Set(directEditKeys.map(toKey));
	const conflictingSystemIds = new Set<string>();

	// Cascaded updates of the same request colliding with a direct edit or with each other
	const cascadeKeys = new Set<string>();
	cascadeUpdateKeys.forEach((cascadeUpdateKey) => {
		const key = toKey(cascadeUpdateKey);
		if (directKeys.has(key) || cascadeKeys.has(key)) {
			conflictingSystemIds.add(cascadeUpdateKey.systemId);
		}
		cascadeKeys.add(key);
	});

	const existingUpdates = existingSubmissionRecords.filter(isUpdateSubmissionRecord);

	const supersededRecordIds = existingUpdates
		.filter(
			(record) =>
				!record.parentRecord &&
				directKeys.has(toKey({ entityName: record.entityName, systemId: record.data.systemId })),
		)
		.map((record) => record.id);
	const supersededIds = new Set(supersededRecordIds);

	existingUpdates.forEach((record) => {
		const isRemovedWithSupersededRecord =
			supersededIds.has(record.id) || (!!record.parentRecord && supersededIds.has(record.parentRecord));
		if (isRemovedWithSupersededRecord) {
			return;
		}

		const key = toKey({ entityName: record.entityName, systemId: record.data.systemId });
		if (directKeys.has(key) || cascadeKeys.has(key)) {
			conflictingSystemIds.add(record.data.systemId);
		}
	});

	return { supersededRecordIds, conflictingSystemIds: [...conflictingSystemIds] };
};

/**
 * Marks each `idFieldChange` UPDATE as invalid when any of its consequence records is invalid, so the state of the
 * edit the user made reflects the records that apply it.
 *
 * The parent receives one summary error listing the invalid consequence record IDs instead of copies of their errors:
 * those errors describe fields and values of other records, sometimes of other entities, and stay on those records.
 * When the parent already has errors (for example a conflict), the summary is appended to them.
 *
 * @param errors - The errors found for the Active Submission records.
 * @param submissionData - The Active Submission records that were validated.
 * @returns The errors, including the summary errors added to parent records.
 */
export const addInvalidConsequenceErrorsToParents = (
	errors: SubmissionErrors,
	submissionData: SubmissionRecordWithEntityName[],
): SubmissionErrors => {
	const recordsById = new Map(submissionData.map((record) => [record.id, record]));

	const invalidRecordIdsByParentId = new Map<number, number[]>();
	extractRecordIdsFromSubmissionErrors(errors).forEach((recordId) => {
		const parentRecordId = recordsById.get(recordId)?.parentRecord;
		if (parentRecordId) {
			invalidRecordIdsByParentId.set(parentRecordId, [
				...(invalidRecordIdsByParentId.get(parentRecordId) ?? []),
				recordId,
			]);
		}
	});

	if (invalidRecordIdsByParentId.size === 0) {
		return errors;
	}

	const updates: Record<string, SubmissionRecordErrorDetails[]> = { ...errors.updates };
	invalidRecordIdsByParentId.forEach((invalidRecordIds, parentRecordId) => {
		const parentRecord = recordsById.get(parentRecordId);
		if (!parentRecord) {
			return;
		}

		const sortedInvalidRecordIds = [...invalidRecordIds].sort((first, second) => first - second);
		const summaryError: RecordErrorInvalidConsequence = {
			reason: 'INVALID_CONSEQUENCE_RECORD',
			invalidRecordIds: sortedInvalidRecordIds,
			message: `Record(s) '${sortedInvalidRecordIds.join(', ')}' staged as a consequence of this ID field change are invalid`,
		};

		// A record must appear once per bucket: each entry becomes one state update, so duplicates would race
		const entityErrors = updates[parentRecord.entityName] ?? [];
		const hasExistingErrors = entityErrors.some((recordErrors) => recordErrors.recordId === parentRecordId);
		updates[parentRecord.entityName] = hasExistingErrors
			? entityErrors.map((recordErrors) =>
					recordErrors.recordId === parentRecordId
						? { recordId: parentRecordId, errors: [...recordErrors.errors, summaryError] }
						: recordErrors,
				)
			: [...entityErrors, { recordId: parentRecordId, errors: [summaryError] }];
	});

	return { ...errors, updates };
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
