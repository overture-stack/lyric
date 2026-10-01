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
 * Returns the identifier of the group a Submission Record belongs to. A consequence record belongs to the group of its
 * parent record; any other record is its own group.
 */
const getRecordGroupId = (record: Pick<SubmissionRecordWithEntityName, 'id' | 'parentRecord'>): number =>
	record.parentRecord ?? record.id;

/**
 * Collects the `UPDATE` records to apply on top of the Submitted Data.
 *
 * An `UPDATE` with `idFieldChange` is excluded: it is not applied itself, its consequence records (the `DELETE` of the
 * original record, the `INSERT` of the replacement and the dependents' foreign key `UPDATE`s) apply the change.
 */
export const createSubmissionUpdateRecords = (
	submissionData: SubmissionRecordWithEntityName[],
): SubmissionUpdateRecordWithEntityName[] => {
	return submissionData.reduce<SubmissionUpdateRecordWithEntityName[]>((acc, item) => {
		// Applying an `idFieldChange` UPDATE as well as its consequence records would apply the change twice
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
 * This is a safety net: records staged through `resolveStagedEditReplacements` never have both an `UPDATE` and a
 * `DELETE` of the same systemId outside one group, so this check only finds conflicts among records staged without it.
 *
 * An `UPDATE` and a `DELETE` of the same group are not a conflict: an `idFieldChange` UPDATE is staged together with
 * the `DELETE` of the record it changes, which references it through `parentRecord`. That parent `UPDATE` together
 * with a `DELETE` staged independently (without `parentRecord`) is still a conflict.
 *
 * Returns one conflict error for every conflicting record, on both the `UPDATE` and the `DELETE` side, grouped under
 * the `updates` and `deletes` buckets and then by entity name. Returns an empty object when there are no conflicts.
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

/** Identifies a Submitted Data record targeted by a staged change, scoped to its entity. */
export type EditStagingKey = {
	entityName: string;
	systemId: string;
};

/** Action of a staged change that targets an existing Submitted Data record. */
export type EditActionType = 'UPDATE' | 'DELETE';

/** A record that targets an existing Submitted Data record, either staged or about to be staged by a request. */
export type EditStagingRecord = EditStagingKey & {
	actionType: EditActionType;
};

/**
 * A parent edit of an incoming request: a direct `UPDATE` (with or without `idFieldChange`) or a direct `DELETE`.
 */
export type IncomingParentEdit = EditStagingRecord & {
	idFieldChange: boolean;
	/**
	 * Consequence records of the edit that target other Submitted Data records: the foreign key `UPDATE`s of the
	 * dependents of an ID field change, or the `DELETE`s of the dependents of a deleted record. The `DELETE` and
	 * `INSERT` of an ID field change for its own record are not listed: they target the edited record itself, and the
	 * `INSERT` has no `systemId`.
	 */
	consequences: EditStagingRecord[];
};

/** A record involved in a staging conflict. `recordId` is set only for records that are already staged. */
export type StagingConflictRecord = EditStagingRecord & {
	recordId?: number;
};

/** The parent record whose consequence record is involved in a staging conflict. */
export type StagingConflictParentRecord = StagingConflictRecord & {
	idFieldChange: boolean;
};

/**
 * A conflict that rejects a whole staging request:
 * - `TARGETS_CONSEQUENCE_RECORD`: a parent edit of the request targets a record already staged as the consequence of
 *   another parent. `parentRecord` is that staged parent.
 * - `CONSEQUENCE_COLLISION`: a consequence record the request would stage targets a record that is already staged,
 *   directly or as the consequence of another parent, or that another record of the same request targets.
 *   `parentRecord` is the parent edit of the request that generates the consequence record.
 */
export type StagingConflict = {
	reason: 'TARGETS_CONSEQUENCE_RECORD' | 'CONSEQUENCE_COLLISION';
	message: string;
	incomingRecord: EditStagingRecord;
	conflictingRecord: StagingConflictRecord;
	parentRecord: StagingConflictParentRecord;
};

/**
 * A staged parent record that a request replaces, discarding it from the Active Submission. It describes the parent
 * only; its consequence records are discarded with it and are not listed. `data` is the discarded staged change, which
 * was never applied to Submitted Data.
 */
export type ReplacedStagedRecord = {
	recordId: number;
	systemId: string;
	entityName: string;
	actionType: EditActionType;
	idFieldChange: boolean;
	data: SubmissionUpdateData | SubmissionDeleteData;
};

/**
 * Represents the result of resolving the parent edits of a request against the records already staged.
 */
type StagedEditReplacementResolution = {
	/** Staged parent records the request replaces, without their consequence records */
	replacedRecords: ReplacedStagedRecord[];
	/**
	 * Parent edits to stage, each with the consequence records to stage. Leaves out a `DELETE` of a record that already
	 * has a `DELETE` staged, together with its consequences, and consequence `DELETE`s of records that already have a
	 * `DELETE` staged
	 */
	editsToStage: IncomingParentEdit[];
	/** Conflicts between the request and the staged records, or between records of the request */
	conflicts: StagingConflict[];
};

/**
 * Builds the key identifying the Submitted Data record targeted by a staged change, unique per entity and systemId.
 */
export const toEditStagingKey = ({ entityName, systemId }: EditStagingKey): string =>
	JSON.stringify([entityName, systemId]);

/**
 * Resolves the parent edits of an incoming edit or delete request against the records already staged in the Active
 * Submission.
 *
 * A parent edit record is a direct `UPDATE` (with or without `idFieldChange`) or a direct `DELETE`: one without
 * `parentRecord`. Its consequence records reference it through `parentRecord`.
 *
 * Replacement:
 * - An incoming parent edit replaces every staged parent edit record of the same entity and systemId, whatever the
 *   action types of both. The consequence records of a replaced parent count as removed by the request.
 * - Exception: an incoming `DELETE` of a record that already has a direct `DELETE` staged changes nothing. The staged
 *   `DELETE` is kept, and the incoming `DELETE` and its consequences are not staged.
 *
 * Conflicts are evaluated after replacement, so records that the request removes do not count:
 * - An incoming parent edit conflicts with a record staged as the consequence of another parent.
 * - A consequence record of the request conflicts with a record already staged for the same systemId, directly or as
 *   the consequence of another parent, and with another record of the same request.
 * - A `DELETE` overlapping a `DELETE` is never a conflict. An incoming direct `DELETE` of a record that already has a
 *   consequence `DELETE` staged is not staged, together with its consequences; a consequence `DELETE` of a record that
 *   already has a `DELETE` staged or requested is not staged.
 *
 * Returns:
 * - `replacedRecords`: the staged parent records to delete, without their consequence records;
 * - `editsToStage`: the incoming parent edits to stage, each with the consequence records to stage;
 * - `conflicts`: every conflict found. `editsToStage` still includes the parent edits involved in a conflict, and leaves
 *   out the consequence records involved in one, so a request with conflicts cannot be staged as requested.
 *
 * @param params.incomingEdits - Assumed to hold one edit per entity and systemId. Duplicate edits are not detected, and
 * each one is returned in `editsToStage`.
 * @param params.existingSubmissionRecords - Records other than `UPDATE`s and `DELETE`s are ignored.
 * @throws {Error} when a parent edit conflicts with a staged consequence record whose parent is missing from
 * `existingSubmissionRecords`
 */
export const resolveStagedEditReplacements = ({
	incomingEdits,
	existingSubmissionRecords,
}: {
	incomingEdits: IncomingParentEdit[];
	existingSubmissionRecords: SubmissionRecordWithEntityName[];
}): StagedEditReplacementResolution => {
	type StagedEditRecord = {
		record: SubmissionRecordWithEntityName;
		data: SubmissionUpdateData | SubmissionDeleteData;
		target: EditStagingRecord;
	};

	const stagedEditRecords = existingSubmissionRecords.flatMap((record): StagedEditRecord[] => {
		if (isUpdateSubmissionRecord(record) || isDeleteSubmissionRecord(record)) {
			return [
				{
					record,
					data: record.data,
					target: { entityName: record.entityName, systemId: record.data.systemId, actionType: record.actionType },
				},
			];
		}
		return [];
	});

	const stagedRecordsById = new Map(stagedEditRecords.map((stagedRecord) => [stagedRecord.record.id, stagedRecord]));
	const stagedRecordsByKey = new Map<string, StagedEditRecord[]>();
	stagedEditRecords.forEach((stagedRecord) => {
		const key = toEditStagingKey(stagedRecord.target);
		stagedRecordsByKey.set(key, [...(stagedRecordsByKey.get(key) ?? []), stagedRecord]);
	});

	// Replacement: find the staged parent records each incoming parent edit replaces
	const replacedRecordIds = new Set<number>();
	const alreadyStagedKeys = new Set<string>();
	incomingEdits.forEach((edit) => {
		const key = toEditStagingKey(edit);
		(stagedRecordsByKey.get(key) ?? []).forEach((stagedRecord) => {
			if (stagedRecord.record.parentRecord) {
				return;
			}
			if (edit.actionType === 'DELETE' && stagedRecord.target.actionType === 'DELETE') {
				alreadyStagedKeys.add(key);
				return;
			}
			replacedRecordIds.add(stagedRecord.record.id);
		});
	});

	const isRemovedByRequest = ({ id, parentRecord }: SubmissionRecordWithEntityName): boolean =>
		replacedRecordIds.has(id) || (!!parentRecord && replacedRecordIds.has(parentRecord));
	const getRemainingStagedRecords = (key: EditStagingKey): StagedEditRecord[] =>
		(stagedRecordsByKey.get(toEditStagingKey(key)) ?? []).filter(
			(stagedRecord) => !isRemovedByRequest(stagedRecord.record),
		);

	const toRecordDetails = ({ entityName, systemId, actionType }: EditStagingRecord): EditStagingRecord => ({
		entityName,
		systemId,
		actionType,
	});
	const toStagedRecordDetails = (stagedRecord: StagedEditRecord): StagingConflictRecord => ({
		recordId: stagedRecord.record.id,
		...toRecordDetails(stagedRecord.target),
	});
	const toStagedParentDetails = (parentRecordId: number): StagingConflictParentRecord => {
		const parent = stagedRecordsById.get(parentRecordId);
		if (!parent) {
			throw new Error(`Parent record '${parentRecordId}' of a staged consequence record was not found`);
		}
		return { ...toStagedRecordDetails(parent), idFieldChange: parent.record.idFieldChange };
	};
	const describeRecord = ({ actionType, entityName, systemId }: EditStagingRecord): string =>
		`${actionType} of system ID '${systemId}' in entity '${entityName}'`;

	const conflicts: StagingConflict[] = [];

	// Parent edits targeting a record staged as the consequence of another parent
	const parentEditsToStage = incomingEdits.filter((edit) => {
		if (alreadyStagedKeys.has(toEditStagingKey(edit))) {
			return false;
		}

		let isAlreadyDeleted = false;
		getRemainingStagedRecords(edit).forEach((stagedRecord) => {
			const parentRecordId = stagedRecord.record.parentRecord;
			if (!parentRecordId) {
				return;
			}
			if (edit.actionType === 'DELETE' && stagedRecord.target.actionType === 'DELETE') {
				isAlreadyDeleted = true;
				return;
			}
			conflicts.push({
				reason: 'TARGETS_CONSEQUENCE_RECORD',
				message: `The ${describeRecord(edit)} targets record '${stagedRecord.record.id}', staged as a consequence of record '${parentRecordId}'. Remove record '${parentRecordId}' from the submission first.`,
				incomingRecord: toRecordDetails(edit),
				conflictingRecord: toStagedRecordDetails(stagedRecord),
				parentRecord: toStagedParentDetails(parentRecordId),
			});
		});
		return !isAlreadyDeleted;
	});

	// Records the request stages, to find collisions between records of the same request
	const requestRecordsByKey = new Map<string, EditStagingRecord[]>();
	const addRequestRecord = (record: EditStagingRecord): void => {
		const key = toEditStagingKey(record);
		requestRecordsByKey.set(key, [...(requestRecordsByKey.get(key) ?? []), record]);
	};
	parentEditsToStage.forEach((edit) => addRequestRecord(toRecordDetails(edit)));

	// Consequence records of the request colliding with staged records or with other records of the request
	const editsToStage = parentEditsToStage.map((edit): IncomingParentEdit => {
		const parentDetails: StagingConflictParentRecord = { ...toRecordDetails(edit), idFieldChange: edit.idFieldChange };

		const consequences = edit.consequences.filter((consequence) => {
			const remainingStagedRecords = getRemainingStagedRecords(consequence);
			const requestRecords = requestRecordsByKey.get(toEditStagingKey(consequence)) ?? [];
			const overlappingRecords = [...remainingStagedRecords.map(({ target }) => target), ...requestRecords];

			if (overlappingRecords.length === 0) {
				addRequestRecord(toRecordDetails(consequence));
				return true;
			}

			if (
				consequence.actionType === 'DELETE' &&
				overlappingRecords.every((overlappingRecord) => overlappingRecord.actionType === 'DELETE')
			) {
				return false;
			}

			remainingStagedRecords.forEach((stagedRecord) => {
				conflicts.push({
					reason: 'CONSEQUENCE_COLLISION',
					message: `The ${describeRecord(consequence)}, a consequence of the ${describeRecord(edit)}, targets the same record as staged record '${stagedRecord.record.id}'.`,
					incomingRecord: toRecordDetails(consequence),
					conflictingRecord: toStagedRecordDetails(stagedRecord),
					parentRecord: parentDetails,
				});
			});
			requestRecords.forEach((requestRecord) => {
				conflicts.push({
					reason: 'CONSEQUENCE_COLLISION',
					message: `The ${describeRecord(consequence)}, a consequence of the ${describeRecord(edit)}, targets the same record as the ${describeRecord(requestRecord)} in the same request.`,
					incomingRecord: toRecordDetails(consequence),
					conflictingRecord: toRecordDetails(requestRecord),
					parentRecord: parentDetails,
				});
			});
			return false;
		});

		return { ...edit, consequences };
	});

	const replacedRecords = stagedEditRecords
		.filter((stagedRecord) => replacedRecordIds.has(stagedRecord.record.id))
		.map(
			({ record, data, target }): ReplacedStagedRecord => ({
				recordId: record.id,
				systemId: target.systemId,
				entityName: target.entityName,
				actionType: target.actionType,
				idFieldChange: record.idFieldChange,
				data,
			}),
		);

	return { replacedRecords, editsToStage, conflicts };
};

/**
 * Marks each parent record (an `idFieldChange` UPDATE, or a DELETE with dependent DELETEs) as invalid when any of its
 * consequence records is invalid, so the state of the edit the user made reflects the records that apply it.
 *
 * The parent receives one summary error listing the invalid consequence record IDs. The errors of the consequence
 * records stay on those records and are not copied to the parent. When the parent already has errors (for example a
 * conflict), the summary is appended to them.
 *
 * Returns `errors` with the summary errors added, without modifying the object passed in. A summary error is added to
 * the bucket of the parent's own action: `updates` for an `UPDATE`, `deletes` for a `DELETE`.
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
	const deletes: Record<string, SubmissionRecordErrorDetails[]> = { ...errors.deletes };
	invalidRecordIdsByParentId.forEach((invalidRecordIds, parentRecordId) => {
		const parentRecord = recordsById.get(parentRecordId);
		if (!parentRecord) {
			return;
		}

		const sortedInvalidRecordIds = [...invalidRecordIds].sort((first, second) => first - second);
		const parentDescription = parentRecord.idFieldChange ? 'this ID field change' : 'this delete';
		// A summary instead of copies of the consequence errors: those describe fields and values of other records,
		// sometimes of other entities
		const summaryError: RecordErrorInvalidConsequence = {
			reason: 'INVALID_CONSEQUENCE_RECORD',
			invalidRecordIds: sortedInvalidRecordIds,
			message: `Record(s) '${sortedInvalidRecordIds.join(', ')}' staged as a consequence of ${parentDescription} are invalid`,
		};

		// A record must appear once, in the bucket of its own action: each entry becomes one state update, so
		// duplicates would race
		const bucket = isDeleteSubmissionRecord(parentRecord) ? deletes : updates;
		const entityErrors = bucket[parentRecord.entityName] ?? [];
		const hasExistingErrors = entityErrors.some((recordErrors) => recordErrors.recordId === parentRecordId);
		bucket[parentRecord.entityName] = hasExistingErrors
			? entityErrors.map((recordErrors) =>
					recordErrors.recordId === parentRecordId
						? { recordId: parentRecordId, errors: [...recordErrors.errors, summaryError] }
						: recordErrors,
				)
			: [...entityErrors, { recordId: parentRecordId, errors: [summaryError] }];
	});

	return {
		...errors,
		...(Object.keys(updates).length > 0 ? { updates } : {}),
		...(Object.keys(deletes).length > 0 ? { deletes } : {}),
	};
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
