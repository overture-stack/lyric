import * as _ from 'lodash-es';

import type { DataRecord, DictionaryValidationRecordErrorDetails, Schema } from '@overture-stack/lectern-client';
import type {
	DataDiff,
	NewSubmissionRecord,
	NewSubmittedData,
	Submission,
	SubmissionData,
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionRecord,
	SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import createSubmissionRepository, {
	type SubmissionWithDictionaryAndCategoryRepositoryRecord,
} from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import createDictionaryRepository from '../../repository/dictionaryRepository.js';
import createSubmissionFilesRepository from '../../repository/submissionFilesRepository.js';
import createSubmissionRecordsRepository from '../../repository/submissionRecordsRepository.js';
import createSubmittedDataRepository from '../../repository/submittedRepository.js';
import type { RepositoryTransaction } from '../../repository/types.js';
import { getDictionarySchemaRelations, type SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import { formatByteSize, genericSubmissionFileName, getSizeInBytes } from '../../utils/fileUtils.js';
import { convertRecordToString } from '../../utils/formatUtils.js';
import { parseRecordsToInsert } from '../../utils/recordsParser.js';
import {
	addInvalidConsequenceErrorsToParents,
	extractRecordIdsFromSubmissionErrors,
	findUpdateDeleteConflicts,
	mergeSubmissionErrors,
	resolveEditStagingConflicts,
	type SubmissionErrors,
} from '../../utils/submissionRecordUtils.js';
import {
	extractSchemaDataFromMergedDataRecords,
	type FileParseResult,
	filterRelationsForPrimaryIdUpdate,
	findInvalidRecordErrorsBySchemaName,
	groupSchemaErrorsByEntity,
	mapGroupedUpdateSubmissionData,
	mergeAndReferenceEntityData,
	mergeUpdatesBySystemId,
	openSubmissionStatus,
	parseToSchema,
	segregateFieldChangeRecords,
	submissionInsertDataFromFiles,
	validateSchemas,
	validationStartSubmissionStatus,
} from '../../utils/submissionUtils.js';
import {
	computeDataDiff,
	groupByEntityName,
	groupErrorsByIndex,
	groupSchemaDataByEntityName,
	mergeSubmittedDataAndDeduplicateById,
	updateSubmittedDataArray,
} from '../../utils/submittedDataUtils.js';
import {
	type CommitSubmissionParams,
	type EntityData,
	type FileSchemaMap,
	type ResultCommit,
	type ResultOnCommit,
	type SchemasDictionary,
	SUBMISSION_STATUS,
} from '../../utils/types.js';
import createSubmittedDataRelationsSearch from '../submittedData/searchDataRelations.js';

/**
 * An edit that changes an ID field, together with the `DELETE` of the original record and the `INSERT` of its
 * replacement that are staged as its consequence.
 */
type IdFieldChange = {
	update: SubmissionUpdateData;
	deleteRecord: SubmissionDeleteData;
	insertRecord: SubmissionInsertData;
};

const createSubmissionProcessor = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_PROCESSOR_SERVICE';
	const categoryRepository = createCategoryRepository(dependencies);
	const dictionaryRepository = createDictionaryRepository(dependencies);
	const submissionRepository = createSubmissionRepository(dependencies);
	const submittedDataRepository = createSubmittedDataRepository(dependencies);
	const submittedDataRelationsSearch = createSubmittedDataRelationsSearch(dependencies);
	const submissionRecordsRepository = createSubmissionRecordsRepository(dependencies);
	const submissionFilesRepository = createSubmissionFilesRepository(dependencies);
	const { logger } = dependencies;

	/**
	 * Marks the data of an Active Submission as changed. In a single conditional update on `tx`, it verifies that the
	 * Submission's status allows changes (`OPEN`, `VALID` or `INVALID`), sets its status to `OPEN` and increments its
	 * version.
	 *
	 * The update locks the Submission row until `tx` ends. The status check, the version increment and every other
	 * write in `tx` therefore take effect together, with no change to the Submission's status or version possible in
	 * between.
	 *
	 * Returns the new version of the Submission.
	 *
	 * @throws {InternalServerError} When the Submission does not exist.
	 * @throws {StatusConflict} When the Submission's status does not allow changes.
	 * @throws {ServiceUnavailable} When the update query fails.
	 */
	const markSubmissionAsChanged = async (
		submissionId: number,
		username: string,
		tx: RepositoryTransaction<Submission>,
	): Promise<number> => {
		const updatedSubmission = await submissionRepository.updateWithConditions(
			{
				submissionId,
				newData: { status: SUBMISSION_STATUS.OPEN, updatedBy: username },
				expectedStatuses: openSubmissionStatus,
				incrementVersion: true,
			},
			tx,
		);

		if (updatedSubmission) {
			return updatedSubmission.version;
		}

		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new InternalServerError(`Submission '${submissionId}' not found while marking its data as changed`);
		}
		throw new StatusConflict(`Existing submission with status '${submission.status}' cannot be modified`);
	};

	/**
	 * Logs an error thrown while staging changes on a Submission. A `StatusConflict` is an expected outcome when the
	 * Submission started validating or committing in the meantime, so it is logged at info level. Any other error is
	 * logged at error level.
	 */
	const logStagingError = (message: string, error: unknown): void => {
		if (error instanceof StatusConflict) {
			logger.info(LOG_MODULE, `${message}: ${error.message}`);
			return;
		}
		logger.error(LOG_MODULE, message, error instanceof Error ? error.message : JSON.stringify(error));
	};

	/**
	 * Processes a list of data records and compares them with previously submitted data.
	 * @param {DataRecord[]} records An array of data records to be processed
	 * @param {string} schemaName The name of the schema associated with the records
	 * @returns {Promise<SubmissionUpdateData[]>} An array of `SubmissionUpdateData` objects, in the order of `records`.
	 *          Each object contains the `systemId`, `old` data, and `new` data representing the differences
	 *          between the previously submitted data and the updated record.
	 */
	const compareUpdatedData = async (records: DataRecord[], schemaName: string): Promise<SubmissionUpdateData[]> => {
		const { getSubmittedDataBySystemId } = submittedDataRepository;

		const promises = records.map(async (record): Promise<SubmissionUpdateData | undefined> => {
			const systemId = record['systemId']?.toString();
			if (!systemId) {
				return undefined;
			}

			const foundSubmittedData = await getSubmittedDataBySystemId(systemId);
			if (foundSubmittedData?.data) {
				if (foundSubmittedData.entityName !== schemaName) {
					logger.info(
						LOG_MODULE,
						`Entity name mismatch for system ID '${systemId}': expected '${schemaName}', found '${foundSubmittedData.entityName}'`,
					);
					return {
						systemId: systemId,
						old: {},
						new: {},
					};
				}
				const changeData = _.omit(record, 'systemId');
				const diffData = computeDataDiff(foundSubmittedData.data, changeData);
				if (!_.isEmpty(diffData.old) && !_.isEmpty(diffData.new)) {
					return {
						systemId: systemId,
						old: diffData.old,
						new: diffData.new,
					};
				}
				return undefined;
			}
			logger.info(LOG_MODULE, `No submitted data found for system ID '${systemId}'`);
			return {
				systemId: systemId,
				old: {},
				new: {},
			};
		});

		// Wait for all records to be processed. Results keep the order of the records so the last edit of a
		// systemId in the request is the one that wins
		const results = await Promise.all(promises);

		return results.filter((result): result is SubmissionUpdateData => result !== undefined);
	};

	/**
	 * Finds and returns the dependent updates based on the provided submission update data.
	 *
	 * This function processes submission update data to identify dependencies between entities
	 * as defined in the `dictionaryRelations`. It checks if updates in one entity impact other
	 * related entities, and retrieves those dependent updates. The result is a collection of
	 * update data, grouped by entity, that represents the cascading changes needed for the
	 * submission process.
	 *
	 * @param dictionaryRelations - A mapping of entity names to their schema child nodes, representing relationships between entities.
	 * @param organization - The organization identifier associated with the submission data.
	 * @param submissionUpdateData - The submission data containing updates for various entities, mapped by entity names.
	 * @returns A Promise that resolves to an object with the records that has dependents and an object where each key is an entity name,
	 * and the value is an array of `SubmissionUpdateData` representing the dependent updates for that entity.
	 */
	const findUpdateDependents = async ({
		dictionaryRelations,
		organization,
		submissionUpdateData,
	}: {
		dictionaryRelations: Record<string, SchemaChildNode[]>;
		organization: string;
		submissionUpdateData: Record<string, SubmissionUpdateData[]>;
	}): Promise<{ submissionUpdateData: SubmissionUpdateData; dependents: Record<string, SubmissionUpdateData[]> }[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepository;
		const { searchDirectDependents } = submittedDataRelationsSearch;

		const dependentUpdates = Object.entries(submissionUpdateData).reduce<
			Promise<{ submissionUpdateData: SubmissionUpdateData; dependents: Record<string, SubmissionUpdateData[]> }[]>
		>(async (accPromise, [submissionUpdateEntityName, submissionUpdateRecords]) => {
			const acc = await accPromise;

			const result = await Promise.all(
				submissionUpdateRecords.map(async (submissionUpdateRecord) => {
					const entityRelations = dictionaryRelations[submissionUpdateEntityName];
					if (!entityRelations) {
						return { submissionUpdateData: submissionUpdateRecord, dependents: {} };
					}

					// Finds if updates are impacting dependant records based on it's foreign keys
					const filterDependents = filterRelationsForPrimaryIdUpdate(entityRelations, submissionUpdateRecord);

					if (filterDependents.length === 0) {
						return { submissionUpdateData: submissionUpdateRecord, dependents: {} };
					}

					const directDependents = await getSubmittedDataFiltered(organization, filterDependents);

					const additionalDepends = (
						await Promise.all(
							directDependents.map((record) =>
								searchDirectDependents({
									data: record.data,
									dictionaryRelations,
									entityName: record.entityName,
									organization: record.organization,
									systemId: record.systemId,
								}),
							),
						)
					).flat();

					const uniqueDependents = mergeSubmittedDataAndDeduplicateById(directDependents, additionalDepends);

					const groupedDependents = groupByEntityName(uniqueDependents);

					const groupedSubmissionUpdateDependents = mapGroupedUpdateSubmissionData({
						dependentData: groupedDependents,
						filterEntity: filterDependents,
						newDataRecord: submissionUpdateRecord.new,
					});

					return { submissionUpdateData: submissionUpdateRecord, dependents: groupedSubmissionUpdateDependents };
				}),
			);

			acc.push(...result);
			return acc;
		}, Promise.resolve([]));

		return dependentUpdates;
	};

	/**
	 * This function iterates over records that are changing ID fields and fetches existing submitted data by `systemId`,
	 * then generates a record to be deleted and to be inserted for each of them.
	 * The result keeps each ID field change together with its delete and insert records, organized by entity names.
	 * Records with no Submitted Data found are left out.
	 * @param idFieldChangeRecord Records that are changing ID fields
	 * @returns
	 */
	const handleIdFieldChanges = async (
		idFieldChangeRecord: Record<string, SubmissionUpdateData[]>,
	): Promise<Record<string, IdFieldChange[]>> => {
		const { getSubmittedDataBySystemId } = submittedDataRepository;

		const idFieldChangesByEntity: Record<string, IdFieldChange[]> = {};
		for (const [entityName, updateRecords] of Object.entries(idFieldChangeRecord)) {
			const idFieldChanges: IdFieldChange[] = [];
			for (const updateRecord of updateRecords) {
				const foundSubmittedData = await getSubmittedDataBySystemId(updateRecord.systemId);

				if (!foundSubmittedData) {
					continue;
				}

				idFieldChanges.push({
					update: updateRecord,
					deleteRecord: {
						systemId: foundSubmittedData.systemId,
						data: foundSubmittedData.data,
						isValid: foundSubmittedData.isValid,
						organization: foundSubmittedData.organization,
					},
					insertRecord: { ...foundSubmittedData.data, ...updateRecord.new },
				});
			}
			idFieldChangesByEntity[entityName] = idFieldChanges;
		}
		return idFieldChangesByEntity;
	};

	/**
	 * This function validates whole data together against a dictionary,
	 * then persists the data on the database and finally updates the Submission status to 'committed'.
	 * If any step fails, the operation is aborted and the error is thrown.
	 *
	 * When `params.version` is provided, the data is only written if the Submission has status `COMMITTING` and
	 * that version. This is checked with the Submission row locked, in the same transaction that writes the data;
	 * when it does not match, a `StatusConflict` is thrown and nothing is written. When `params.version` is omitted,
	 * the Submission status is set to `COMMITTED` without checking its status or version.
	 *
	 * The response includes the data that was committed, which can be used by the caller to perform additional post commit actions,
	 * such as an 'onFinishCommit' callback.
	 * @param params
	 * @param params.dataToValidate Data to be validated, This object contains:
	 * - `inserts`: An array of new records to be committed. Optional
	 * - `submittedData`: An array of existing Submitted Data. Optional
	 * - `deletes`: An array of `systemId`s representing items that should be deleted. Optional
	 * - `updates`: An array of records to be updated. Optional
	 * @param params.dictionary A `Dictionary` object for Data Validation
	 * @param params.submissionId The ID of the Active Submission
	 * @param params.username User who performs the action
	 * @returns The data that was committed, the submissionId, category and organization.
	 */
	const performCommitSubmissionAsync = async (params: CommitSubmissionParams): Promise<ResultOnCommit> => {
		try {
			const { dictionary, dataToValidate, submissionId, username } = params;

			const submission = await submissionRepository.getSubmissionById(submissionId);

			if (!submission) {
				throw new Error(`Submission '${submissionId}' not found`);
			}

			// Merge Submitted Data with items to be inserted, updated or deleted consist on 3 steps
			// Step 1: Exclude items that are marked for deletion
			const systemIdsToDelete = new Set<string>(
				Object.values(dataToValidate.deletes).flatMap((items) => items.map((item) => item.systemId)),
			);
			logger.info(LOG_MODULE, `Found '${systemIdsToDelete.size}' Records to delete on Submission '${submission.id}'`);
			const submittedData = systemIdsToDelete.size
				? dataToValidate.submittedData?.filter((item) => !systemIdsToDelete.has(item.systemId))
				: dataToValidate.submittedData;

			// Step 2: Modify items marked for update
			const systemIdsToUpdate = new Set<string>(dataToValidate.updates ? Object.keys(dataToValidate.updates) : []);
			logger.info(LOG_MODULE, `Found '${systemIdsToUpdate.size}' Records to update on Submission '${submission.id}'`);
			const submittedDataToValidate = dataToValidate.updates
				? updateSubmittedDataArray(submittedData, Object.values(dataToValidate.updates))
				: submittedData;

			// Step 3: Add items marked for insertion
			logger.info(
				LOG_MODULE,
				`Found '${dataToValidate.inserts.length}' Records to insert on Submission '${submission.id}'`,
			);
			const schemasDataToValidate = groupSchemaDataByEntityName({
				inserts: dataToValidate.inserts,
				submittedData: submittedDataToValidate,
			});

			const resultValidation = validateSchemas(dictionary, schemasDataToValidate.schemaDataByEntityName);

			const resultCommit: ResultCommit = {
				inserts: [],
				updates: [],
				deletes: [],
			};

			type UpdateSubmittedDataParams = {
				submittedDataId: number;
				data: Partial<SubmittedData>;
				audit: {
					dataDiff: DataDiff;
					errors?: DictionaryValidationRecordErrorDetails[];
					isMigration: boolean;
					oldIsValid: boolean;
					submissionId: number;
				};
			};

			const insertsToSave: NewSubmittedData[] = [];
			const updatesToSave: UpdateSubmittedDataParams[] = [];
			const deletesToProcess: { diff: DataDiff; submissionId: number; systemId: string; username: string }[] = [];

			Object.entries(schemasDataToValidate.submittedDataByEntityName).forEach(([entityName, records]) => {
				const invalidRecordErrors = findInvalidRecordErrorsBySchemaName(resultValidation, entityName);
				const errorsByIndex = groupErrorsByIndex(invalidRecordErrors);
				logger.info(LOG_MODULE, `Found '${invalidRecordErrors.length}' invalid records in entity '${entityName}'`);
				records.forEach((record, index) => {
					const errors = errorsByIndex[index] ?? [];
					const newIsValid = errors.length === 0;

					if (record.id) {
						const oldIsValid = record.isValid;
						const inputUpdate: Partial<SubmittedData> = {};

						const submisionUpdateData = dataToValidate.updates?.[record.systemId];
						if (submisionUpdateData) {
							logger.debug(
								LOG_MODULE,
								`Updating submittedData system ID '${record.systemId}' in entity '${entityName}'`,
							);
							inputUpdate.data = record.data;
						}

						if (oldIsValid !== newIsValid) {
							inputUpdate.isValid = newIsValid;
							if (newIsValid) {
								inputUpdate.lastValidSchemaId = dictionary.id;
							}
						}

						if (Object.keys(inputUpdate).length === 0) {
							return;
						}

						inputUpdate.updatedBy = username;
						if (newIsValid) {
							inputUpdate.lastValidSchemaId = dictionary.id;
						}
						updatesToSave.push({
							submittedDataId: record.id,
							data: inputUpdate,
							audit: {
								dataDiff: { old: submisionUpdateData?.old ?? {}, new: submisionUpdateData?.new ?? {} },
								errors: errors,
								isMigration: params.isMigration || false,
								oldIsValid,
								submissionId: submission.id,
							},
						});

						// Check if either 'data' or 'isValid' keys has been updated
						if ('data' in inputUpdate || 'isValid' in inputUpdate) {
							resultCommit.updates.push({
								data: record.data,
								entityName,
								isValid: newIsValid,
								organization: record.organization,
								systemId: record.systemId,
							});
						}
					} else {
						logger.debug(
							LOG_MODULE,
							`Creating new submittedData in entity '${entityName}' with system ID '${record.systemId}'`,
						);
						record.isValid = newIsValid;
						if (newIsValid) {
							record.lastValidSchemaId = dictionary.id;
						}
						insertsToSave.push(record);

						resultCommit.inserts.push({
							data: record.data,
							entityName,
							isValid: newIsValid,
							organization: record.organization,
							systemId: record.systemId,
						});
					}
				});
			});

			// iterate if there are any record to be deleted
			Object.entries(dataToValidate?.deletes ?? {}).forEach(([entityName, items]) => {
				items.forEach((item) => {
					const { data, isValid, organization, systemId } = item;

					deletesToProcess.push({
						submissionId: submission.id,
						systemId,
						diff: computeDataDiff(data, null),
						username,
					});

					resultCommit.deletes.push({
						data,
						entityName,
						isValid,
						organization,
						systemId,
					});
				});
			});

			await dependencies.db.transaction(async (tx) => {
				const committedSubmissionData = { status: SUBMISSION_STATUS.COMMITTED, updatedAt: new Date() };
				if (params.version !== undefined) {
					// Locks the Submission row before writing any data, and aborts unless the Submission has status
					// 'COMMITTING' and the version verified when the commit was requested
					const committedSubmission = await submissionRepository.updateWithConditions(
						{
							submissionId: submission.id,
							newData: committedSubmissionData,
							expectedStatuses: [SUBMISSION_STATUS.COMMITTING],
							expectedVersion: params.version,
						},
						tx,
					);
					if (!committedSubmission) {
						throw new StatusConflict(
							`Submission '${submission.id}' no longer has status 'COMMITTING' with version '${params.version}'`,
						);
					}
				} else {
					await submissionRepository.update(submission.id, committedSubmissionData, tx);
				}

				if (insertsToSave.length) {
					await submittedDataRepository.save(insertsToSave, tx);
				}
				if (updatesToSave.length) {
					await submittedDataRepository.update(updatesToSave, tx);
				}
				if (deletesToProcess.length) {
					await submittedDataRepository.deleteBySystemId(deletesToProcess, tx);
				}

				logger.info(
					LOG_MODULE,
					`Finished processing data changes for submission '${submission.id}', updating submission status to 'COMMITTED'.`,
				);
			});

			return {
				categoryAlias: submission.dictionaryCategory.alias ?? undefined,
				categoryId: submission.dictionaryCategory.id,
				data: resultCommit,
				organization: submission.organization,
				submissionId: submission.id,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : error;
			logger.info(
				LOG_MODULE,
				`Unable to complete performCommitSubmissionAsync for submission ${params.submissionId}, an error was thrown during execution`,
				message,
			);
			logger.error(LOG_MODULE, error);
			throw error;
		}
	};

	/**
	 * Validates an Active Submission combined with all Submitted Data.
	 * Active Submission is updated after validation is complete.
	 *
	 * Validation only starts if the Submission still has the `version` this job was queued for and a status that
	 * validation can start from (`OPEN`). Otherwise the Submission changed after this job was queued (a newer
	 * validation job is queued for it, or it was closed), and this job stops without changing anything.
	 * If validation throws, the Submission is moved back from `VALIDATING` to `OPEN`, so it is not left in a
	 * status that rejects new changes.
	 *
	 * `version` must be the version returned by the staging transaction that queued this job.
	 *
	 * Returns the ID of the updated Submission, or `undefined` when:
	 * - the validation was skipped because the Submission changed after this job was queued;
	 * - the result was discarded because the Submission changed while it was being validated.
	 *
	 * @throws {Error} When the Submission does not exist.
	 * @throws {BadRequest} When the category has no active dictionary. The status is reset to `OPEN` first.
	 * @throws {ServiceUnavailable} When a database query fails. The status is reset to `OPEN` first when validation
	 * had started.
	 */
	const performDataValidation = async (
		submissionId: number,
		username: string,
		version: number,
	): Promise<number | undefined> => {
		const { getSubmissionById, updateWithConditions } = submissionRepository;

		// Get Active Submission from database
		const activeSubmission = await getSubmissionById(submissionId);

		if (!activeSubmission) {
			throw new Error(`Submission '${submissionId}' not found`);
		}

		// Mark the Submission as 'VALIDATING' as validation starts, only if this job is for the Submission's latest
		// version. The check and the status change are a single conditional update, so no changes can be staged
		// between them.
		const startedSubmission = await updateWithConditions({
			submissionId,
			newData: { status: SUBMISSION_STATUS.VALIDATING, updatedBy: username },
			expectedStatuses: validationStartSubmissionStatus,
			expectedVersion: version,
		});

		if (!startedSubmission) {
			logger.info(
				LOG_MODULE,
				`Skipping validation of Submission '${submissionId}' for version '${version}': the Submission changed after this validation was queued`,
			);
			return undefined;
		}

		try {
			return await validateSubmissionData(activeSubmission, version);
		} catch (error) {
			const resetSubmission = await updateWithConditions({
				submissionId,
				newData: { status: SUBMISSION_STATUS.OPEN, updatedBy: username },
				expectedStatuses: [SUBMISSION_STATUS.VALIDATING],
				expectedVersion: version,
			});
			if (resetSubmission) {
				logger.info(LOG_MODULE, `Validation of Submission '${submissionId}' failed, status reset to 'OPEN'`);
			}
			throw error;
		}
	};

	/**
	 * Runs the validation of a Submission that has already been moved to `VALIDATING`, then stores the result.
	 *
	 * Returns the ID of the updated Submission, or `undefined` when the result was discarded because the Submission
	 * changed while it was being validated.
	 *
	 * @throws {BadRequest} When the category has no active dictionary.
	 * @throws {ServiceUnavailable} When a database query fails.
	 */
	const validateSubmissionData = async (
		activeSubmission: SubmissionWithDictionaryAndCategoryRepositoryRecord,
		version: number,
	): Promise<number | undefined> => {
		const { getActiveDictionaryByCategory } = categoryRepository;
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepository;
		const submissionId = activeSubmission.id;

		// Get Submitted Data from database
		const submittedData = await getSubmittedDataByCategoryIdAndOrganization(
			activeSubmission.dictionaryCategory.id,
			activeSubmission.organization,
		);

		const currentDictionary = await getActiveDictionaryByCategory(activeSubmission.dictionaryCategory.id);
		if (!currentDictionary) {
			throw new BadRequest(`Dictionary in category '${activeSubmission.dictionaryCategory.id}' not found`);
		}

		const submissionRecords = await submissionRecordsRepository.getBySubmissionId(submissionId);

		// Detect records where the same systemId has both an UPDATE and a DELETE staged, before
		// running dictionary validation. Both sides of a conflict are rejected explicitly instead
		// of letting one action silently win.
		const conflictErrors = findUpdateDeleteConflicts(submissionRecords.records);
		const conflictingRecordIds = extractRecordIdsFromSubmissionErrors(conflictErrors);

		if (conflictingRecordIds.size > 0) {
			logger.info(
				LOG_MODULE,
				`Detected '${conflictingRecordIds.size}' Submission Record(s) with conflicting UPDATE/DELETE actions on the same systemId in Submission '${submissionId}'`,
				JSON.stringify(conflictErrors),
			);
		}

		// Exclude conflicting records from validation; neither side of a conflict should be applied
		const nonConflictingSubmissionRecords = conflictingRecordIds.size
			? submissionRecords.records.filter((record) => !conflictingRecordIds.has(record.id))
			: submissionRecords.records;

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeAndReferenceEntityData({
			submissionId,
			submissionData: nonConflictingSubmissionRecords,
			submittedData,
		});

		// Prepare data to validate. Extract schema data from merged data
		const crossSchemasDataToValidate = extractSchemaDataFromMergedDataRecords(dataMergedByEntityName);

		// Run validation using Lectern Client
		const resultValidation = validateSchemas(currentDictionary, crossSchemasDataToValidate);

		// Collect errors of the Active Submission
		const schemaValidationErrors = groupSchemaErrorsByEntity({
			resultValidation,
			dataValidated: dataMergedByEntityName,
		});

		// An `idFieldChange` UPDATE is not validated itself; it is invalid when any of its consequence records is
		const submissionSchemaErrors = addInvalidConsequenceErrorsToParents(
			mergeSubmissionErrors(conflictErrors, schemaValidationErrors),
			submissionRecords.records,
		);

		if (_.isEmpty(submissionSchemaErrors)) {
			logger.info(LOG_MODULE, `No error found on data submission`);
		} else {
			const errorMessage = Object.entries(submissionSchemaErrors).flatMap(([submissionType, entitiesError]) =>
				Object.entries(entitiesError).map(
					([entityName, errors]) =>
						` '${errors.length}' error found in the '${entityName}' entity under '${submissionType}'`,
				),
			);
			logger.info(LOG_MODULE, `Errors detected in data submission:${errorMessage}`);
		}

		// Update Active Submission
		return await updateActiveSubmission({
			idActiveSubmission: submissionId,
			schemaErrors: submissionSchemaErrors,
			dictionaryId: currentDictionary.id,
			validatedRecordIds: submissionRecords.records.map((record) => record.id),
			version,
		});
	};

	/**
	 * Saves the records staged by an edit request, in one generic `submission_files` row per affected entity.
	 *
	 * Edits that do not change an ID field are saved as UPDATEs. Each ID field change is saved as an UPDATE with
	 * `idFieldChange` set, followed by its consequence records referencing it through `parentRecord`: the DELETE of the
	 * original record, the INSERT of its replacement and the foreign key UPDATEs of its dependents.
	 * @param params
	 * @param params.dependentUpdatesBySystemId Foreign key updates of the dependents of each edited record, by its systemId
	 * @param params.idFieldChanges Edits changing an ID field, by entity name
	 * @param params.nonIdFieldChanges Edits not changing an ID field, by entity name
	 * @param params.submissionId ID of the Active Submission
	 * @param tx The transaction to save the records in
	 */
	const saveEditRecords = async (
		{
			dependentUpdatesBySystemId,
			idFieldChanges,
			nonIdFieldChanges,
			submissionId,
		}: {
			dependentUpdatesBySystemId: Map<string, Record<string, SubmissionUpdateData[]>>;
			idFieldChanges: Record<string, IdFieldChange[]>;
			nonIdFieldChanges: Record<string, SubmissionUpdateData[]>;
			submissionId: number;
		},
		tx: RepositoryTransaction<SubmissionRecord>,
	): Promise<void> => {
		// Records of each entity, used to size its file
		const recordsByEntity: Record<string, SubmissionData[]> = {};
		const addEntityRecords = (entityName: string, entityRecords: SubmissionData[]): void => {
			if (entityRecords.length > 0) {
				recordsByEntity[entityName] = [...(recordsByEntity[entityName] ?? []), ...entityRecords];
			}
		};
		Object.entries(nonIdFieldChanges).forEach(([entityName, updates]) => addEntityRecords(entityName, updates));
		Object.entries(idFieldChanges).forEach(([entityName, entityIdFieldChanges]) => {
			entityIdFieldChanges.forEach(({ update, deleteRecord, insertRecord }) => {
				addEntityRecords(entityName, [update, deleteRecord, insertRecord]);
				Object.entries(dependentUpdatesBySystemId.get(update.systemId) ?? {}).forEach(
					([dependentEntityName, dependentUpdates]) => addEntityRecords(dependentEntityName, dependentUpdates),
				);
			});
		});

		/**
		 * Submission files are entity-scoped: the file's entity name identifies the schema used to
		 * validate and process its records. Create one file per affected entity so records from
		 * different entities are never mixed in the same file.
		 */
		const fileIdsByEntity = new Map<string, number>();
		for (const [entityName, entityRecords] of Object.entries(recordsByEntity)) {
			// fileSize reflects only the records actually attached to this entity's file below —
			// not the full request input, which belongs to the edited entity and may be
			// unrelated to a cascading dependent entity's file.
			const savedFileId = await submissionFilesRepository.save(
				{
					entityName: entityName,
					fileName: genericSubmissionFileName(),
					fileSize: getSizeInBytes(JSON.stringify(entityRecords)),
					submissionId,
				},
				tx,
			);
			fileIdsByEntity.set(entityName, savedFileId);
		}

		// Line numbers count each action type separately within each entity's file
		const lineNumbers = new Map<string, number>();
		const saveRecords = async (
			entityName: string,
			entityRecords: Omit<NewSubmissionRecord, 'fileId' | 'lineNumber' | 'state'>[],
		): Promise<number[]> => {
			const fileId = fileIdsByEntity.get(entityName);
			if (fileId === undefined) {
				throw new Error(`No Submission File created for entity '${entityName}'`);
			}
			return submissionRecordsRepository.saveManyForFile(
				fileId,
				entityRecords.map((record) => {
					const lineNumberKey = `${entityName}:${record.actionType}`;
					const lineNumber = (lineNumbers.get(lineNumberKey) ?? 0) + 1;
					lineNumbers.set(lineNumberKey, lineNumber);
					return { ...record, lineNumber, state: 'RECEIVED' };
				}),
				tx,
			);
		};

		for (const [entityName, updates] of Object.entries(nonIdFieldChanges)) {
			await saveRecords(
				entityName,
				updates.map((update) => ({ actionType: 'UPDATE', data: update })),
			);
		}

		for (const [entityName, entityIdFieldChanges] of Object.entries(idFieldChanges)) {
			for (const { update, deleteRecord, insertRecord } of entityIdFieldChanges) {
				// The parent is saved on its own to get its ID before its consequence records reference it
				const [parentRecordId] = await saveRecords(entityName, [
					{ actionType: 'UPDATE', data: update, idFieldChange: true },
				]);
				if (parentRecordId === undefined) {
					throw new Error(`Failed to save the update of system ID '${update.systemId}'`);
				}

				await saveRecords(entityName, [
					{ actionType: 'DELETE', data: deleteRecord, parentRecord: parentRecordId },
					{ actionType: 'INSERT', data: insertRecord, parentRecord: parentRecordId },
				]);

				for (const [dependentEntityName, dependentUpdates] of Object.entries(
					dependentUpdatesBySystemId.get(update.systemId) ?? {},
				)) {
					await saveRecords(
						dependentEntityName,
						dependentUpdates.map((dependentUpdate) => ({
							actionType: 'UPDATE',
							data: dependentUpdate,
							parentRecord: parentRecordId,
						})),
					);
				}
			}
		}
	};

	/**
	 * Void function to process and validate uploaded records on an Active Submission.
	 * Performs the schema data validation of data to be edited combined with all Submitted Data.
	 *
	 * Although `records` belongs to a single `schema`, edits can affect more than that one entity:
	 * - An edit that does not change an ID field is staged as an UPDATE.
	 * - An edit that changes an ID field (a field referenced by another schema's foreign key) is staged as an
	 *   UPDATE with `idFieldChange` set. That UPDATE is what the user sees as their edit, but it is not applied
	 *   itself; the records staged as its consequence, which reference it through `parentRecord`, apply it:
	 *   - a DELETE of the original record and an INSERT of its replacement, scoped to `schema.name`;
	 *   - UPDATEs of the dependent records that reference the old ID via a foreign key, scoped to the
	 *     dependent's own entity name, not `schema.name`.
	 *
	 * Each systemId has at most one UPDATE staged per entity. An edit of a systemId replaces the UPDATE already staged
	 * for it, and deleting an `idFieldChange` UPDATE deletes its consequence records. Within a request, the last edit
	 * of a systemId wins. The find-and-replace runs in one transaction holding a lock on the Submission row, so
	 * concurrent edits of the same Submission cannot both stage an UPDATE for the same systemId.
	 *
	 * When an edit collides with a dependent's foreign key UPDATE cascaded from an ID field change, in either order,
	 * nothing from the request is staged and the conflict is logged: replacing the cascaded UPDATE would undo the
	 * foreign key change.
	 *
	 * Side effect: for every entity touched by the above (not just `schema.name`), this creates one
	 * `submission_files` row scoped to that entity and attaches its INSERT/UPDATE/DELETE records to it.
	 * These rows are a bookkeeping construct required by the data model (`submissionRecords` must
	 * reference a `fileId`) rather than a record of an actual uploaded file — there was only one file
	 * (or none, for programmatic edits) in the original request.
	 * @param records Records to be processed
	 * @param params
	 * @param params.schema Schema to parse data with
	 * @param params.submission A `Submission` object representing the Active Submission
	 * @param params.username User who performs the action
	 */
	const processEditRecordsAsync = async (
		records: Record<string, unknown>[],
		{
			schema,
			submissionId,
			username,
		}: {
			schema: Schema;
			submissionId: number;
			username: string;
		},
	): Promise<void> => {
		const { getDictionary } = dictionaryRepository;
		const { getSubmissionById } = submissionRepository;

		try {
			// Parse file data
			const recordsParsed = records.map(convertRecordToString).map(parseToSchema(schema));

			// Within a request, the last edit of a systemId wins
			const filesDataProcessed =
				mergeUpdatesBySystemId({ [schema.name]: await compareUpdatedData(recordsParsed, schema.name) })[schema.name] ??
				[];

			// Every systemId in the request replaces the UPDATE staged for it, including the ones whose edit matches
			// the Submitted Data: those leave no UPDATE staged.
			const directEditKeys = recordsParsed.flatMap((record) => {
				const systemId = record['systemId']?.toString();
				return systemId ? [{ entityName: schema.name, systemId }] : [];
			});

			const submission = await getSubmissionById(submissionId);
			if (!submission) {
				throw new Error(`Submission '${submissionId}' not found`);
			}

			const currentDictionary = await getDictionary(submission.dictionary.name, submission.dictionary.version);
			if (!currentDictionary) {
				throw new BadRequest(
					`Dictionary with name '${submission.dictionary.name}' and version '${submission.dictionary.version}' not found`,
				);
			}

			// get dictionary relations
			const dictionaryRelations = getDictionarySchemaRelations(currentDictionary.dictionary);

			const foundDependentUpdates = await findUpdateDependents({
				dictionaryRelations,
				organization: submission.organization,
				submissionUpdateData: { [schema.name]: filesDataProcessed },
			});

			const systemIdsWithDependents: string[] = [];

			// Iterate through the foundDependentUpdates once
			for (const { submissionUpdateData, dependents } of foundDependentUpdates) {
				const numDependents = Object.keys(dependents).length;

				if (numDependents > 0) {
					systemIdsWithDependents.push(`System ID '${submissionUpdateData.systemId}' has ${numDependents} dependents`);
				}
			}

			if (systemIdsWithDependents.length) {
				logger.info(LOG_MODULE, `Direct dependencies found: ${systemIdsWithDependents.join(', ')}`);
			} else {
				logger.info(LOG_MODULE, 'No dependents found on any system ID.');
			}

			// Dependents of each edited record, by its systemId. Dependents found only through another dependent
			// (for example the players of a team whose sport changes) have no field to change and are left out.
			const dependentUpdatesBySystemId = new Map(
				foundDependentUpdates.map(({ submissionUpdateData, dependents }) => [
					submissionUpdateData.systemId,
					_.pickBy(
						_.mapValues(dependents, (updates) =>
							updates.filter((update) => !_.isEmpty(update.old) || !_.isEmpty(update.new)),
						),
						(updates) => updates.length > 0,
					),
				]),
			);

			// Identify what requested updates involves ID and nonID field changes
			const { idFieldChangeRecord, nonIdFieldChangeRecord } = segregateFieldChangeRecords(
				{ [schema.name]: filesDataProcessed },
				dictionaryRelations,
			);

			// Creates the delete and insert records of each ID field change
			const idFieldChanges = await handleIdFieldChanges(idFieldChangeRecord);

			const cascadeUpdateKeys = Object.values(idFieldChanges)
				.flat()
				.flatMap(({ update }) =>
					Object.entries(dependentUpdatesBySystemId.get(update.systemId) ?? {}).flatMap(([entityName, updates]) =>
						updates.map((dependentUpdate) => ({ entityName, systemId: dependentUpdate.systemId })),
					),
				);

			if (directEditKeys.length === 0) {
				logger.info(LOG_MODULE, `No changes to stage on Submission '${submission.id}'`);
				return;
			}

			const stagedVersion = await dependencies.db.transaction(async (tx) => {
				// Locks the Submission row until the transaction ends, so concurrent edits find and replace staged
				// UPDATEs one at a time
				const newVersion = await markSubmissionAsChanged(submission.id, username, tx);

				const stagedUpdates = await submissionRecordsRepository.getBySubmissionId(
					submission.id,
					undefined,
					{ actionTypes: ['UPDATE'] },
					tx,
				);

				const { supersededRecordIds, conflictingSystemIds } = resolveEditStagingConflicts({
					directEditKeys,
					cascadeUpdateKeys,
					existingSubmissionRecords: stagedUpdates.records,
				});

				if (conflictingSystemIds.length > 0) {
					// Throwing rolls back the transaction, including the status and version change
					throw new Error(
						`Cannot stage edits on entity '${schema.name}' in Submission '${submission.id}': system ID(s) '${conflictingSystemIds.join(', ')}' collide with a foreign key update cascaded from an ID field change. No records from this request were staged.`,
					);
				}

				// Deleting a superseded `idFieldChange` UPDATE also deletes its consequence records
				const affectedFileIds = await submissionRecordsRepository.deleteByIds(supersededRecordIds, tx);
				await submissionFilesRepository.deleteEmptyByIds(affectedFileIds, tx);
				if (supersededRecordIds.length > 0) {
					logger.info(
						LOG_MODULE,
						`Replaced '${supersededRecordIds.length}' staged update(s) on entity '${schema.name}' in Submission '${submission.id}'`,
					);
				}

				await saveEditRecords(
					{
						dependentUpdatesBySystemId,
						idFieldChanges,
						nonIdFieldChanges: nonIdFieldChangeRecord,
						submissionId: submission.id,
					},
					tx,
				);

				return newVersion;
			});

			// Runs Schema Data validation of the staged version in a worker thread
			dependencies.workerPool.dataValidation({ submissionId: submission.id, username, version: stagedVersion });
		} catch (error) {
			logStagingError(`There was an error processing records on entity '${schema.name}'`, error);
		}
		logger.info(LOG_MODULE, `Finished validating files`);
	};

	/**
	 * Processes and validates a batch of incoming records for an active submission.
	 * This function updates the submission merging the new records with existing submission data.
	 * Performs a full schema data validation against the combined dataset
	 * @param params
	 * @param params.records A map of entity names to arrays of raw records to be processed.
	 * @param params.schemasDictionary A dictionary of schema definitions used for record validation.
	 * @param params.submissionId Submission ID
	 * @param params.username User who performs the action
	 * @returns
	 */
	const processInsertRecordsAsync = async ({
		records,
		schemasDictionary,
		submissionId,
		username,
	}: {
		records: EntityData;
		schemasDictionary: SchemasDictionary;
		submissionId: number;
		username: string;
	}): Promise<void> => {
		try {
			const insertRecords = parseRecordsToInsert(records, schemasDictionary);

			// All entities are staged in a single transaction, so they are validated together under one version
			const stagedVersion = await dependencies.db.transaction(async (tx) => {
				const newVersion = await markSubmissionAsChanged(submissionId, username, tx);

				for (const [entityName, entityRecords] of Object.entries(insertRecords)) {
					const savedFileId = await submissionFilesRepository.save(
						{
							entityName,
							fileName: genericSubmissionFileName(),
							fileSize: getSizeInBytes(JSON.stringify(entityRecords)),
							submissionId,
						},
						tx,
					);
					await submissionRecordsRepository.saveManyForFile(
						savedFileId,
						entityRecords.map((record, index) => ({
							actionType: 'INSERT',
							data: record,
							state: 'RECEIVED',
							lineNumber: index + 1,
						})),
						tx,
					);
				}

				return newVersion;
			});

			// Runs Schema Data validation of the staged version in a worker thread
			dependencies.workerPool.dataValidation({ submissionId, username, version: stagedVersion });
		} catch (error) {
			logStagingError(`There was an error processing records on submission '${submissionId}'`, error);
		}
		logger.info(LOG_MODULE, `Finished processInsertRecordsAsync for submission ${submissionId}`);
	};

	/**
	 * Stores the result of a validation, in one transaction:
	 * - the Submission status becomes `VALID` when there are no errors, otherwise `INVALID`;
	 * - records with errors become `INVALID`, and the rest of `validatedRecordIds` become `VALID`.
	 *
	 * Only records present in `validatedRecordIds`, the records that were actually validated, are touched.
	 *
	 * The result is applied only if the Submission still has status `VALIDATING` and the `version` that was
	 * validated. Otherwise the Submission changed while it was being validated (for example, it was closed), so the
	 * result is stale and is discarded without changing the Submission or its records.
	 *
	 * Returns the ID of the updated Submission, or `undefined` when the result was discarded.
	 *
	 * @throws {ServiceUnavailable} When a database query fails. Nothing is changed.
	 */
	const updateActiveSubmission = async (input: {
		dictionaryId: number;
		idActiveSubmission: number;
		schemaErrors: SubmissionErrors;
		validatedRecordIds: number[];
		version: number;
	}): Promise<number | undefined> => {
		const { dictionaryId, idActiveSubmission, schemaErrors, validatedRecordIds, version } = input;
		const newStatusSubmission =
			Object.keys(schemaErrors).length > 0 ? SUBMISSION_STATUS.INVALID : SUBMISSION_STATUS.VALID;

		return await dependencies.db.transaction(async (tx) => {
			// Update with new data, only if the validated version is still the current one
			const updatedActiveSubmission = await submissionRepository.updateWithConditions(
				{
					submissionId: idActiveSubmission,
					newData: {
						status: newStatusSubmission,
						dictionaryId: dictionaryId,
					},
					expectedStatuses: [SUBMISSION_STATUS.VALIDATING],
					expectedVersion: version,
				},
				tx,
			);

			if (!updatedActiveSubmission) {
				logger.info(
					LOG_MODULE,
					`Discarding validation result of Submission '${idActiveSubmission}' for version '${version}': the Submission changed during validation`,
				);
				return undefined;
			}
			const updatedActiveSubmissionId = updatedActiveSubmission.id;

			const invalidRecords = Object.values(schemaErrors).flatMap((entityErrors) =>
				Object.values(entityErrors).flatMap((recordErrors) =>
					recordErrors.map(({ recordId, errors }) => ({
						id: recordId,
						errors,
					})),
				),
			);

			const recordsWithoutError = validatedRecordIds.filter(
				(id) => !invalidRecords.some((invalidRecord) => invalidRecord.id === id),
			);

			// Update records with validation state, marking records with errors as 'INVALID' and records without errors as 'VALID'
			await submissionRecordsRepository.updateValidationState(
				{
					invalidRecords,
					validRecordIds: recordsWithoutError,
				},
				tx,
			);
			logger.info(
				LOG_MODULE,
				`Updated Active submission '${updatedActiveSubmissionId}' with status '${newStatusSubmission}'`,
			);

			return updatedActiveSubmissionId;
		});
	};

	const logFileResult = (result: FileParseResult) => {
		if (result.status === 'error') {
			logger.error(LOG_MODULE, `Failed to parse file`, {
				fileName: result.fileName,
				fileSize: formatByteSize(result.fileSize, 'MB', 2),
				entityName: result.entityName,
				error: result.streamError,
			});
		} else if (result.status === 'invalid') {
			// Log field names and line numbers only — not field values (OWASP A03).
			logger.warn(LOG_MODULE, `File parsed with schema validation issues`, {
				fileName: result.fileName,
				fileSize: formatByteSize(result.fileSize, 'MB', 2),
				entityName: result.entityName,
				errorCount: result.parseErrors.length,
				issues: result.parseErrors.slice(0, 10).map((e) => ({
					line: e.recordIndex,
					fields: e.recordErrors.map((re) => re.fieldName),
				})),
			});
		}
	};

	/**
	 * Void function to process and validate uploaded files on an Active Submission.
	 * Performs the schema data validation combined with all Submitted Data.
	 * @param {FileSchemaMap} fileSchemaMap Mapping the files with a schema
	 * @param {number} submissionId Submission ID
	 * @param {string} username User who performs the action
	 * @returns {void}
	 */
	const addFilesToSubmissionAsync = async (
		fileSchemaMap: FileSchemaMap,
		submissionId: number,
		username: string,
	): Promise<FileParseResult[]> => {
		const fileSummaries = Object.entries(fileSchemaMap)
			.flatMap(([_, { files, schema }]) =>
				files.map((file) => `'${file.originalname}' (${formatByteSize(file.size, 'MB', 2)}, entity: ${schema.name})`),
			)
			.join(', ');
		logger.info(LOG_MODULE, `Processing files: ${fileSummaries}`);

		const fileResult: FileParseResult[] = [];

		try {
			// Parse file data before opening the transaction, so the Submission is not locked while files are read.
			// Each file is isolated; a failure on one does not block others.
			const parsingFileDataResult = await submissionInsertDataFromFiles(fileSchemaMap);

			for (const fileProcessed of parsingFileDataResult) {
				logFileResult(fileProcessed.fileResult);
				fileResult.push(fileProcessed.fileResult);
			}

			const filesToStage = parsingFileDataResult.filter((fileProcessed) => fileProcessed.fileResult.status === 'ok');

			if (filesToStage.length === 0) {
				logger.info(LOG_MODULE, `No valid files to stage on Submission '${submissionId}'`);
				return fileResult;
			}

			const stagedVersion = await dependencies.db.transaction(async (tx) => {
				const newVersion = await markSubmissionAsChanged(submissionId, username, tx);

				for (const fileProcessed of filesToStage) {
					const {
						data,
						fileResult: { entityName, fileName, fileSize },
					} = fileProcessed;

					const fileId = await submissionFilesRepository.save(
						{
							entityName,
							fileName,
							fileSize,
							submissionId,
						},
						tx,
					);

					await submissionRecordsRepository.saveManyForFile(
						fileId,
						data.map(({ record, lineNumber }) => ({
							actionType: 'INSERT',
							data: record,
							state: 'RECEIVED',
							lineNumber,
						})),
						tx,
					);
				}

				return newVersion;
			});

			// Runs Schema Data validation of the staged version in a worker thread
			dependencies.workerPool.dataValidation({ submissionId, username, version: stagedVersion });
		} catch (error) {
			if (error instanceof StatusConflict) {
				logger.info(LOG_MODULE, `Submitted files were not staged on Submission '${submissionId}': ${error.message}`);
			} else {
				logger.error(LOG_MODULE, `Error processing submitted files`, {
					files: fileSummaries,
					error: error instanceof Error ? error.message : String(error),
					errorType: error instanceof Error ? error.name : 'unknown',
				});
			}
		}
		logger.info(
			LOG_MODULE,
			`Finished addFilesToSubmissionAsync on submission "${submissionId}" submitted by user "${username}"`,
		);

		return fileResult;
	};

	return {
		markSubmissionAsChanged,
		performCommitSubmissionAsync,
		performDataValidation,
		processEditRecordsAsync,
		processInsertRecordsAsync,
		updateActiveSubmission,
		addFilesToSubmissionAsync,
	};
};

export default { create: createSubmissionProcessor };
