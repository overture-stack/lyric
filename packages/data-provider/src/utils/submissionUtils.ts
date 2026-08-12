import * as _ from 'lodash-es';
import plur from 'plur';

import {
	type DataRecord,
	Dictionary as SchemasDictionary,
	DictionaryValidationError,
	parse,
	type ParseSchemaError,
	Schema,
	TestResult,
	validate,
} from '@overture-stack/lectern-client';
import {
	type RecordErrorActionConflict,
	type SubmissionDeleteData,
	type SubmissionInsertData,
	type SubmissionRecordError,
	type SubmissionUpdateData,
	type SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../repository/submissionRecordsRepository.js';
import { getSubmittedFileEntity } from '../services/submission/submissionFile.js';
import { isSubmissionActionTypeValid } from './auditUtils.js';
import type { SchemaChildNode } from './dictionarySchemaRelations.js';
import { getSchemaFieldNames } from './dictionaryUtils.js';
import { readHeaders, readTextFile } from './fileUtils.js';
import { asArray } from './formatUtils.js';
import type { FilenameEntityPair } from './schemas.js';
import { groupErrorsByIndex, mapAndMergeSubmittedDataToRecordReferences } from './submittedDataUtils.js';
import {
	BATCH_ERROR_TYPE,
	type BatchError,
	type DataRecordReference,
	type EditSubmittedDataReference,
	type FileSchemaMap as FileSchemaMap,
	MERGE_REFERENCE_TYPE,
	type NewSubmittedDataReference,
	SUBMISSION_RECORD_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionInsertRecordWithEntityName,
	type SubmissionRecordActionType,
	type SubmissionStatus,
	type SubmissionUpdateRecordWithEntityName,
	SubmittedDataReference,
} from './types.js';

export const inProcessSubmissionStatus = [SUBMISSION_STATUS.VALIDATING, SUBMISSION_STATUS.COMMITTING] as const;
export type InProcessSubmissionStatus = typeof inProcessSubmissionStatus;

// Only "open", "valid", and "invalid" statuses are considered Active Submission
export const openSubmissionStatus = [
	SUBMISSION_STATUS.OPEN,
	SUBMISSION_STATUS.VALID,
	SUBMISSION_STATUS.INVALID,
] as const;
export type OpenSubmissionStatus = typeof openSubmissionStatus;

/** Determines if a Submission status is considered active based on its status
 * @param {SubmissionStatus} status Status of a Submission
 * @returns {boolean}
 */
export const isSubmissionActive = (status: SubmissionStatus): status is OpenSubmissionStatus[number] => {
	const openStatuses: SubmissionStatus[] = [...openSubmissionStatus];
	return openStatuses.includes(status);
};

/**
 * Checks if each file contains all required fields defined by its schema
 * @param {FileSchemaMap} entityFileMap Files mapped to their resolved entity name and schema
 * @returns a list of valid files and a list of errors
 */
export const checkEntityFieldNames = async (
	entityFileMap: FileSchemaMap,
): Promise<{
	checkedEntities: FileSchemaMap;
	fieldNameErrors: BatchError[];
}> => {
	const checkedEntities: FileSchemaMap = {};
	const fieldNameErrors: BatchError[] = [];

	for (const [entityName, { files, schema }] of Object.entries(entityFileMap)) {
		const checkedRecord: (typeof checkedEntities)[number] = { files: [], schema };
		for (const file of files) {
			try {
				const fileHeaders = await readHeaders(file);
				const schemaFieldNames = getSchemaFieldNames(schema);

				const missingRequiredFields = schemaFieldNames.required.filter(
					(requiredField) => !fileHeaders.includes(requiredField),
				);
				if (missingRequiredFields.length > 0) {
					fieldNameErrors.push({
						type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
						message: `Missing required fields '${JSON.stringify(missingRequiredFields)}'`,
						batchName: file.originalname,
					});
				} else {
					checkedRecord.files.push(file);
				}
			} catch (error) {
				fieldNameErrors.push({
					type: BATCH_ERROR_TYPE.FILE_READ_ERROR,
					message: `Error reading file '${file.originalname}'`,
					batchName: file.originalname,
				});
			}
		}
		if (checkedRecord.files.length > 0) {
			checkedEntities[entityName] = checkedRecord;
		}
	}
	return {
		checkedEntities,
		fieldNameErrors,
	};
};

/**
 * For each file, determine the schema that will be used to validate it, or create an error record
 * describing why it cannot be mapped to a Schema.
 * @param {Express.Multer.File[]} files An array of files
 * @param {Schema[]} schemas Schemas in the dictionary
 * @param {FilenameEntityPair[]} fileEntityMap Optional mapping of filenames to entity names
 * @returns A list of valid files mapped by schema/entity names
 */
export const resolveFileEntities = async (
	files: Express.Multer.File[],
	schemas: Schema[],
	fileEntityMap?: FilenameEntityPair[],
): Promise<{
	validFileEntity: FileSchemaMap;
	batchErrors: BatchError[];
}> => {
	const validFileEntity: FileSchemaMap = {};
	const batchErrors: BatchError[] = [];

	for (const file of files) {
		const entityResult = getSubmittedFileEntity({ file, schemas, fileEntityMap });
		if (entityResult.success) {
			const mapValue = validFileEntity[entityResult.data.name] ?? { files: [], schema: entityResult.data };
			mapValue.files.push(file);
			validFileEntity[entityResult.data.name] = mapValue;
		} else {
			batchErrors.push({
				type: BATCH_ERROR_TYPE.INVALID_FILE_NAME,
				message: entityResult.data.message,
				batchName: file.originalname,
			});
		}
	}

	return {
		validFileEntity,
		batchErrors,
	};
};

/**
 * Checks if object is a Submission or a SubmittedData
 * @param {SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference} toBeDetermined
 * @returns {boolean}
 */
export const determineIfIsSubmission = (
	reference: SubmittedDataReference | NewSubmittedDataReference | EditSubmittedDataReference,
) =>
	reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ||
	reference.type === MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA;

/**
 * Creates a Record type of DataRecord[] grouped by Entity names
 * @param {Record<string, DataRecordReference[]>} mergeDataRecordsByEntityName
 * @returns {Record<string, DataRecord[]>}
 */
export const extractSchemaDataFromMergedDataRecords = (
	mergeDataRecordsByEntityName: Record<string, DataRecordReference[]>,
): Record<string, DataRecord[]> => {
	return _.mapValues(mergeDataRecordsByEntityName, (mappingArray) => mappingArray.map((o) => o.dataRecord));
};

/**
 * Checks whether a record exists within a collection of submitted data records marked for update.
 * The lookup is performed by matching the given 'entityName' and 'systemId'.
 *
 * @Returns true if found, false otherwise
 */
export const findEditSubmittedData = (
	entityName: string,
	systemId: string,
	dataByEntityName: Record<string, DataRecordReference[]>,
) => {
	return (
		dataByEntityName[entityName]?.some(
			(data) =>
				data.reference.type === MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA && data.reference.systemId === systemId,
		) ?? false
	);
};
/**
 * Finds and returns a list of invalid records based on a provided schema name.
 *
 * This function checks if the validation results are marked as invalid, and if so,
 * filters the validation errors to return those related to a specific schema name.
 *
 * @param results - The validation results containing details of validation errors.
 * @param entityName - The name of the schema to filter the invalid records by.
 *
 * @returns An array of invalid records for the specified schema, or an empty array if none are found.
 */
export const findInvalidRecordErrorsBySchemaName = (
	results: TestResult<DictionaryValidationError[]>,
	entityName: string,
) => {
	return results.valid === false
		? results.details
				.filter((err) => err.reason === 'INVALID_RECORDS')
				.filter((r) => r.schemaName == entityName)
				.flatMap((e) => e.invalidRecords)
		: [];
};

/**
 * Returns a filter to query the database used to find dependents records when the update record involves changes of an primary ID field
 *
 * @param schemaRelations An array of `SchemaChildNode` representing the schema relations for the entity. Each node contains information about parent-child relationships.
 * @param updateRecord The update record containing old and new data. The function checks the `old` data to identify fields involved in the relationship.
 * @returns
 */
export const filterRelationsForPrimaryIdUpdate = (
	schemaRelations: SchemaChildNode[],
	updateRecord: SubmissionUpdateData,
): {
	entityName: string;
	dataField: string;
	dataValue: string | undefined;
}[] => {
	return (
		schemaRelations
			.filter((childNode) => childNode.parent?.fieldName)
			// To identify if the update involves an ID field
			.filter((childNode) => updateRecord.old && updateRecord.old[childNode.fieldName])
			.map((childNode) => {
				return {
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: updateRecord.old[childNode.fieldName]?.toString(),
				};
			})
	);
};
type SubmissionRecordErrorDetails = {
	recordId: number;
	errors: SubmissionRecordError[];
};

export type SubmissionErrors = {
	inserts?: Record<string, SubmissionRecordErrorDetails[]>;
	updates?: Record<string, SubmissionRecordErrorDetails[]>;
	deletes?: Record<string, SubmissionRecordErrorDetails[]>;
};

/**
 * Returns only the schema errors corresponding to the Active Submission.
 * Schema errors are grouped by Entity name.
 * @param {object} input
 * @param {TestResult<DictionaryValidationError[]>} input.resultValidation
 * @param {Record<string, DataRecordReference[]>} input.dataValidated
 * @returns {SubmissionErrors}
 */
export const groupSchemaErrorsByEntity = (input: {
	resultValidation: TestResult<DictionaryValidationError[]>;
	dataValidated: Record<string, DataRecordReference[]>;
}): SubmissionErrors => {
	const { resultValidation, dataValidated } = input;

	if (resultValidation.valid) {
		return {};
	}

	const submissionSchemaErrors: SubmissionErrors = {};
	resultValidation.details.forEach((dictionaryValidationError) => {
		const entityName = dictionaryValidationError.schemaName;
		if (dictionaryValidationError.reason !== 'INVALID_RECORDS') {
			return;
		}

		const groupedErrorsByIndex = groupErrorsByIndex(dictionaryValidationError.invalidRecords);

		if (!groupedErrorsByIndex || Object.keys(groupedErrorsByIndex).length === 0) {
			return;
		}

		Object.entries(groupedErrorsByIndex).forEach(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
			const mapping = dataValidated[entityName]?.[Number(indexBasedOnCrossSchemas)];
			if (!mapping || !determineIfIsSubmission(mapping.reference)) {
				return;
			}

			const submissionRecordId = mapping.reference.recordId;
			const actionType = mapping.reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ? 'inserts' : 'updates';

			if (!submissionSchemaErrors[actionType]) {
				submissionSchemaErrors[actionType] = {};
			}

			if (!submissionSchemaErrors[actionType][entityName]) {
				submissionSchemaErrors[actionType][entityName] = [];
			}

			submissionSchemaErrors[actionType][entityName].push({
				recordId: submissionRecordId,
				errors: schemaValidationErrors,
			});
		});
	});
	return submissionSchemaErrors;
};

/**
 * Scans the Active Submission for `systemId`s (scoped per entity) that have both an UPDATE and a
 * DELETE record staged at the same time. This is meant to run *before* dictionary validation:
 * detecting the conflict up front lets both conflicting records be rejected explicitly, instead of
 * one action silently winning based on array-filtering order later in the validation/merge pipeline.
 * @param {SubmissionRecordWithEntityName[]} submissionData The Active Submission data
 * @returns {SubmissionErrors} Conflict errors under the 'updates' and 'deletes' buckets, grouped by entity name
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

export type DeleteStagingConflicts = {
	/** `recordsToDeleteMap` with systemIds that already have a pending DELETE removed, so they aren't staged twice */
	filteredRecordsToDeleteMap: Record<string, SubmissionDeleteData[]>;
	/** systemIds that already have a pending UPDATE staged for the same entity in the Active Submission */
	conflictingSystemIds: string[];
	/** systemIds that already have a pending DELETE staged for the same entity — skipped instead of duplicated */
	duplicateSystemIds: string[];
};

/**
 * Checks systemIds about to be staged for deletion against what the Active Submission already has
 * pending for the same entity, before a new DELETE record is ever inserted. A systemId with a
 * pending UPDATE is reported as a conflict — the caller should reject the delete rather than
 * silently letting one action override the other, consistent with how `findUpdateDeleteConflicts`
 * treats the same conflict at validation time. A systemId that already has a pending DELETE is
 * treated as a duplicate and dropped from the result, instead of inserting a second DELETE record.
 * @param {Record<string, SubmissionDeleteData[]>} recordsToDeleteMap New deletes, grouped by entity name
 * @param {SubmissionRecordWithEntityName[]} existingSubmissionRecords The Active Submission's current UPDATE/DELETE records
 * @returns {DeleteStagingConflicts}
 */
export const resolveDeleteStagingConflicts = (
	recordsToDeleteMap: Record<string, SubmissionDeleteData[]>,
	existingSubmissionRecords: SubmissionRecordWithEntityName[],
): DeleteStagingConflicts => {
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
 * Merges two `SubmissionErrors` objects together, concatenating each entity's error array
 * bucket-by-bucket instead of overwriting it.
 * @param {SubmissionErrors} a
 * @param {SubmissionErrors} b
 * @returns {SubmissionErrors}
 */
export const mergeSubmissionErrors = (a: SubmissionErrors, b: SubmissionErrors): SubmissionErrors => {
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
	const inserts = mergeBucket(a.inserts, b.inserts);
	if (inserts) {
		merged.inserts = inserts;
	}
	const updates = mergeBucket(a.updates, b.updates);
	if (updates) {
		merged.updates = updates;
	}
	const deletes = mergeBucket(a.deletes, b.deletes);
	if (deletes) {
		merged.deletes = deletes;
	}
	return merged;
};

/**
 * This function extracts the Schema Data from the Active Submission
 * and maps it to it's original reference Id
 * The result mapping is used to perform the cross schema validation
 * @param {number} activeSubmissionId
 * @param {SubmissionInsertRecordWithEntityName[]} activeSubmissionInsertDataEntities
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mapInsertDataToRecordReferences = (
	activeSubmissionId: number,
	activeSubmissionInsertDataEntities: SubmissionInsertRecordWithEntityName[],
): Record<string, DataRecordReference[]> => {
	return activeSubmissionInsertDataEntities.reduce<Record<string, DataRecordReference[]>>(
		(acc, submissionInsertData) => {
			const entityName = submissionInsertData.entityName;
			let entityRecords = acc[entityName];
			if (!entityRecords) {
				entityRecords = [];
				acc[entityName] = entityRecords;
			}
			entityRecords.push({
				dataRecord: submissionInsertData.data,
				reference: {
					submissionId: activeSubmissionId,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					recordId: submissionInsertData.recordId,
				},
			});
			return acc;
		},
		{},
	);
};

/**
 * This function takes a collection of dependent data grouped by entity name, applies a filter to each entity,
 * and creates a mapping of `SubmissionUpdateData` based on the specified filter and new data values.
 *
 * @param params
 * @param param.dependentData A record where each key is an entity name and each value is an array of `SubmittedData` objects.
 * @param param.filterEntity An array of filter criteria where each entry contains an `entityName`, `dataField`, and `dataValue` to filter.
 * @param param.newDataRecord A record containing new data values to be applied to the filtered entities.
 * @returns
 */
export const mapGroupedUpdateSubmissionData = ({
	dependentData,
	filterEntity,
	newDataRecord,
}: {
	dependentData: Record<string, SubmittedData[]>;
	filterEntity: {
		entityName: string;
		dataField: string;
		dataValue: string | undefined;
	}[];
	newDataRecord: DataRecord;
}): Record<string, SubmissionUpdateData[]> => {
	return Object.entries(dependentData).reduce<Record<string, SubmissionUpdateData[]>>(
		(acc, [entityName, dependentRecords]) => {
			acc[entityName] = dependentRecords.map((item) => {
				const filter = filterEntity.find((filter) => filter.entityName === item.entityName);
				const oldValue = filter ? { [filter.dataField]: filter.dataValue } : {};
				const newValue = filter ? { [filter.dataField]: newDataRecord[filter.dataField] } : {};
				return { systemId: item.systemId, old: oldValue, new: newValue };
			});
			return acc;
		},
		{},
	);
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
 * Combines **Active Submission** and the **Submitted Data** recevied as arguments.
 * Then, the Schema Data is extracted and mapped with its internal reference ID.
 * The returned Object is a collection of the raw Schema Data with it's reference ID grouped by entity name.
 * @param {number} submissionId ID of the Active Submission
 * @param {SubmissionRecordWithEntityName[]} submissionData The Active Submission data
 * @param {SubmittedData[]} submittedData An array of Submitted Data
 * @returns {Record<string, DataRecordReference[]>}
 */
export const mergeAndReferenceEntityData = ({
	submissionId,
	submissionData,
	submittedData,
}: {
	submissionId: number;
	submissionData: SubmissionRecordWithEntityName[];
	submittedData: SubmittedData[];
}): Record<string, DataRecordReference[]> => {
	const systemsIdsToRemove = submissionData.filter(isDeleteSubmissionRecord).map((item) => item.data.systemId);

	// Exclude items that are marked for deletion
	const submittedDataFiltered =
		systemsIdsToRemove.length > 0
			? submittedData.filter(({ systemId }) => !systemsIdsToRemove.includes(systemId))
			: submittedData;

	const dataToUpdate = createSubmissionUpdateRecords(submissionData);

	const submittedDataWithRef = mapAndMergeSubmittedDataToRecordReferences({
		submittedData: submittedDataFiltered,
		editSubmittedData: dataToUpdate,
		submissionId,
	});

	const dataToInsert = createSubmissionInsertRecords(submissionData);

	const insertDataWithRef = dataToInsert.length > 0 ? mapInsertDataToRecordReferences(submissionId, dataToInsert) : {};

	// This object will merge existing data + new data for validation (Submitted data + active Submission)
	return _.mergeWith(submittedDataWithRef, insertDataWithRef, (objValue, srcValue) => {
		if (Array.isArray(objValue)) {
			// If both values are arrays, concatenate them
			return objValue.concat(srcValue);
		}
	});
};

/**
 * Merge Active Submission data with incoming TSV file data processed
 *
 * @param objects
 * @returns An arbitrary number of arrays of Record<string, SubmissionUpdateData[]>
 */
export const mergeUpdatesBySystemId = (
	...objects: Record<string, SubmissionUpdateData[]>[]
): Record<string, SubmissionUpdateData[]> => {
	const result: Record<string, SubmissionUpdateData[]> = {};

	// Iterate over all objects
	objects.forEach((obj) => {
		// Iterate over each key in the current object
		Object.entries(obj).forEach(([key, value]) => {
			// Initialize a map to track unique systemIds for this key
			if (!result[key]) {
				result[key] = [];
			}

			const existingIds = new Map<string, SubmissionUpdateData>(result[key].map((item) => [item.systemId, item]));

			// Add or update entries based on systemId uniqueness
			value.forEach((item) => {
				existingIds.set(item.systemId, item);
			});

			// Convert the map back to an array and store it in the result
			result[key] = Array.from(existingIds.values());
		});
	});

	return result;
};

export const pluralizeSchemaName = (schemaName: string) => {
	return plur(schemaName);
};

/**
 * Processes the `foundDependentUpdates` array and segregates the updates based on
 * whether they involve ID fields (dependent fields) or non-ID fields.
 *
 * @param foundDependentUpdates - Array of updates to be processed.
 * @param filesDataProcessed - Record where the key is a string (representing an entity name) and
 * each value is an array of `SubmissionUpdateData`. These are the processed data files to match against.
 * @returns An object containing two records:
 * - `idFieldChangeRecord`: A record of updates involving ID fields.
 * - `nonIdFieldChangeRecord`: A record of updates involving non-ID fields.
 */
export const segregateFieldChangeRecords = (
	submissionUpdateRecords: Record<string, SubmissionUpdateData[]>,
	dictionaryRelations: Record<string, SchemaChildNode[]>,
): {
	idFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
	nonIdFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
} => {
	// Main reduce function
	return Object.entries(submissionUpdateRecords).reduce<{
		idFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
		nonIdFieldChangeRecord: Record<string, SubmissionUpdateData[]>;
	}>(
		(acc, [entityName, submissionUpdateDataArray]) => {
			const schemaRelations = dictionaryRelations[entityName];
			if (schemaRelations) {
				submissionUpdateDataArray.map((submissionUpdateData) => {
					const foundIdFieldUpdated = filterRelationsForPrimaryIdUpdate(schemaRelations, submissionUpdateData);
					const recordKey =
						foundIdFieldUpdated && foundIdFieldUpdated.length > 0 ? 'idFieldChangeRecord' : 'nonIdFieldChangeRecord';

					if (!acc[recordKey][entityName]) {
						acc[recordKey][entityName] = [];
					}
					acc[recordKey][entityName].push(submissionUpdateData);
				});
			}

			return acc;
		},
		{ idFieldChangeRecord: {}, nonIdFieldChangeRecord: {} },
	);
};

/** Per-file outcome from `submissionInsertDataFromFiles`. */
export type FileParseResult = { fileName: string; entityName: string; fileSize: number } & (
	| { status: 'ok' }
	| { status: 'invalid'; parseErrors: ParseSchemaError[] }
	| { status: 'error'; streamError: string }
);

/** Return type of `submissionInsertDataFromFiles`. */
export type FileInsertResult = {
	data: DataRecord[];
	fileResult: FileParseResult;
};

/**
 * Parses all files in the schema map into insertion records.
 * Each file is processed independently: a stream or parse failure on one file is captured and
 * reported without interrupting processing of the remaining files.
 */
export const submissionInsertDataFromFiles = async (fileSchemaMap: FileSchemaMap): Promise<FileInsertResult[]> => {
	const result: FileInsertResult[] = [];

	for (const [entityName, { files, schema }] of Object.entries(fileSchemaMap)) {
		for (const file of files) {
			try {
				const parsedFileData = await readTextFile(file, schema);
				result.push({
					data: parsedFileData.records,
					fileResult: {
						entityName,
						fileName: file.originalname,
						fileSize: file.size,
						...(parsedFileData.errors.length > 0
							? { status: 'invalid', parseErrors: parsedFileData.errors }
							: { status: 'ok' }),
					},
				});
			} catch (err) {
				result.push({
					data: [],
					fileResult: {
						status: 'error',
						fileName: file.originalname,
						fileSize: file.size,
						entityName,
						streamError: err instanceof Error ? err.message : String(err),
					},
				});
			}
		}
	}

	return result;
};

/**
 * Validate a full set of Schema Data using a Dictionary
 * @param {SchemasDictionary & {id: number }} dictionary
 * @param {Record<string, DataRecord[]>} schemasData
 * @returns  A TestResult object representing the outcome of a test applied to some data.
 * If a test is valid, no additional data is added to the result. If it is invalid, then the
 * reason (or array of reasons) for why the test failed should be given.
 */
export const validateSchemas = (
	dictionary: SchemasDictionary & {
		id: number;
	},
	schemasData: Record<string, DataRecord[]>,
) => {
	const schemasDictionary: SchemasDictionary = {
		name: dictionary.name,
		version: dictionary.version,
		schemas: dictionary.schemas,
	};

	return validate.validateDictionary(schemasData, schemasDictionary);
};

export const parseToSchema = (schema: Schema) => (record: Record<string, string>) => {
	const parsedRecord = parse.parseRecordValues(record, schema);
	return parsedRecord.data.record;
};

export const parseSubmissionActionTypes = (values: unknown): SubmissionRecordActionType[] => {
	return asArray(values || [])
		.map((value) => value.toString().toUpperCase())
		.filter(isSubmissionActionTypeValid)
		.map((value) => SUBMISSION_RECORD_ACTION_TYPE.parse(value));
};
