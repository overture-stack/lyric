import bytes from 'bytes';
import * as _ from 'lodash-es';

import type { DataRecord, DictionaryValidationRecordErrorDetails, Schema } from '@overture-stack/lectern-client';
import type {
	DataDiff,
	NewSubmittedData,
	SubmissionDeleteData,
	SubmissionErrors,
	SubmissionInsertData,
	SubmissionRecordErrorDetails,
	SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import createSubmissionRepository from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import createDictionaryRepository from '../../repository/dictionaryRepository.js';
import createSubmittedDataRepository from '../../repository/submittedRepository.js';
import { getDictionarySchemaRelations, type SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { BadRequest } from '../../utils/errors.js';
import { convertRecordToString } from '../../utils/formatUtils.js';
import { parseRecordsToInsert } from '../../utils/recordsParser.js';
import {
	extractSchemaDataFromMergedDataRecords,
	filterDeletesFromUpdates,
	filterRelationsForPrimaryIdUpdate,
	findEditSubmittedData,
	findInvalidRecordErrorsBySchemaName,
	groupSchemaErrorsByEntity,
	isSubmissionActive,
	mapGroupedUpdateSubmissionData,
	mergeAndReferenceEntityData,
	mergeDeleteRecords,
	mergeInsertsRecords,
	mergeUpdatesBySystemId,
	parseToSchema,
	segregateFieldChangeRecords,
	submissionInsertDataFromFiles,
	validateSchemas,
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
	type ValidateFilesParams,
} from '../../utils/types.js';
import createSubmittedDataRelationsSearch from '../submittedData/searchDataRelations.js';

const createSubmissionProcessor = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_PROCESSOR_SERVICE';
	const categoryRepositry = createCategoryRepository(dependencies);
	const dictionaryRepository = createDictionaryRepository(dependencies);
	const submissionRepository = createSubmissionRepository(dependencies);
	const submittedDataRepository = createSubmittedDataRepository(dependencies);
	const submittedDataRelationsSearch = createSubmittedDataRelationsSearch(dependencies);
	const { logger } = dependencies;

	/**
	 * Processes a list of data records and compares them with previously submitted data.
	 * @param {DataRecord[]} records An array of data records to be processed
	 * @param {string} schemaName The name of the schema associated with the records
	 * @returns {Promise<SubmissionUpdateData[]>} An array of `SubmissionUpdateData` objects. Each object
	 *          contains the `systemId`, `old` data, and `new` data representing the differences
	 *          between the previously submitted data and the updated record.
	 */
	const compareUpdatedData = async (records: DataRecord[], schemaName: string): Promise<SubmissionUpdateData[]> => {
		const results: SubmissionUpdateData[] = [];
		const { getSubmittedDataBySystemId } = submittedDataRepository;

		const promises = records.map(async (record) => {
			const systemId = record['systemId']?.toString();
			if (!systemId) {
				return;
			}

			const foundSubmittedData = await getSubmittedDataBySystemId(systemId);
			if (foundSubmittedData?.data) {
				if (foundSubmittedData.entityName !== schemaName) {
					logger.error(
						LOG_MODULE,
						`Entity name mismatch for system ID '${systemId}': expected '${schemaName}', found '${foundSubmittedData.entityName}'`,
					);
					results.push({
						systemId: systemId,
						old: {},
						new: {},
					});
					return;
				}
				const changeData = _.omit(record, 'systemId');
				const diffData = computeDataDiff(foundSubmittedData.data, changeData);
				if (!_.isEmpty(diffData.old) && !_.isEmpty(diffData.new)) {
					results.push({
						systemId: systemId,
						old: diffData.old,
						new: diffData.new,
					});
				}
			} else {
				logger.error(LOG_MODULE, `No submitted data found for system ID '${systemId}'`);
				results.push({
					systemId: systemId,
					old: {},
					new: {},
				});
			}
			return;
		});

		// Wait for all records to be processed
		await Promise.all(promises);

		return results;
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
					if (!Object.prototype.hasOwnProperty.call(dictionaryRelations, submissionUpdateEntityName)) {
						return { submissionUpdateData: submissionUpdateRecord, dependents: {} };
					}

					// Finds if updates are impacting dependant records based on it's foreign keys
					const filterDependents = filterRelationsForPrimaryIdUpdate(
						dictionaryRelations[submissionUpdateEntityName],
						submissionUpdateRecord,
					);

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
	 * then generates a record to be deleted and to be inserted.
	 * The resulting inserts and deletes are organized by entity names.
	 * @param idFieldChangeRecord Records that are changing ID fields
	 * @returns
	 */
	const handleIdFieldChanges = async (idFieldChangeRecord: Record<string, SubmissionUpdateData[]>) => {
		const { getSubmittedDataBySystemId } = submittedDataRepository;

		return Object.entries(idFieldChangeRecord).reduce<
			Promise<{
				inserts: Record<string, SubmissionInsertData>;
				deletes: Record<string, SubmissionDeleteData[]>;
			}>
		>(
			async (accPromise, [entityName, updRecord]) => {
				const acc = await accPromise;

				// iterate each record on this entity
				const result = await updRecord.reduce<
					Promise<{
						inserts: DataRecord[];
						deletes: SubmissionDeleteData[];
					}>
				>(
					async (acc2Promise, u) => {
						const acc2 = await acc2Promise;
						const foundSubmittedData = await getSubmittedDataBySystemId(u.systemId);

						if (!foundSubmittedData) {
							return acc2;
						}

						const deleteRecord: SubmissionDeleteData = {
							systemId: foundSubmittedData.systemId,
							data: foundSubmittedData.data,
							entityName: foundSubmittedData.entityName,
							isValid: foundSubmittedData.isValid,
							organization: foundSubmittedData.organization,
						};

						const insertDataRecord: DataRecord = { ...foundSubmittedData.data, ...u.new };

						acc2.inserts.push(insertDataRecord);
						acc2.deletes.push(deleteRecord);
						return acc2;
					},
					Promise.resolve({ inserts: [], deletes: [] }),
				);

				acc.deletes[entityName] = result.deletes;
				acc.inserts[entityName] = { batchName: entityName, records: result.inserts };

				return acc;
			},
			Promise.resolve({ inserts: {}, deletes: {} }),
		);
	};

	/**
	 * This function validates whole data together against a dictionary,
	 * then persists the data on the database and finally updates the Submission status to 'committed'.
	 * If any step fails, the operation is aborted and the error is thrown.
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
			const systemIdsToDelete = new Set<string>(dataToValidate?.deletes?.map((item) => item.systemId) || []);
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
						const update: Partial<SubmittedData> = {};

						const submisionUpdateData = dataToValidate.updates?.[record.systemId];
						if (submisionUpdateData) {
							logger.info(
								LOG_MODULE,
								`Updating submittedData system ID '${record.systemId}' in entity '${entityName}'`,
							);
							update.data = record.data;
						}

						if (oldIsValid !== newIsValid) {
							update.isValid = newIsValid;
							if (newIsValid) {
								update.lastValidSchemaId = dictionary.id;
							}
						}

						if (Object.keys(update).length === 0) {
							return;
						}

						update.updatedBy = username;
						if (newIsValid) {
							update.lastValidSchemaId = dictionary.id;
						}
						updatesToSave.push({
							submittedDataId: record.id,
							data: update,
							audit: {
								dataDiff: { old: submisionUpdateData?.old ?? {}, new: submisionUpdateData?.new ?? {} },
								errors: errors,
								isMigration: params.isMigration || false,
								oldIsValid,
								submissionId: submission.id,
							},
						});

						// Check if either 'data' or 'isValid' keys has been updated
						if ('data' in update || 'isValid' in update) {
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
			dataToValidate?.deletes?.forEach((item) => {
				const { data, entityName, isValid, organization, systemId } = item;

				deletesToProcess.push({
					submissionId: submission.id,
					systemId: systemId,
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

			await dependencies.db.transaction(async (tx) => {
				if (insertsToSave.length) {
					await submittedDataRepository.save(insertsToSave, tx);
				}
				if (updatesToSave.length) {
					await submittedDataRepository.update(updatesToSave, tx);
				}
				if (deletesToProcess.length) {
					await submittedDataRepository.deleteBySystemId(deletesToProcess, tx);
				}

				await submissionRepository.update(
					submission.id,
					{
						status: SUBMISSION_STATUS.COMMITTED,
						updatedAt: new Date(),
					},
					tx,
				);
			});

			return {
				submissionId: submission.id,
				organization: submission.organization,
				categoryId: submission.dictionaryCategory.id,
				data: resultCommit,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : error;
			logger.info(
				LOG_MODULE,
				`Unable to complete performCommitSubmissionAsync for submission ${params.submissionId}, an error was thrown during execution`,
				message,
			);
			logger.error(error);
			throw error;
		}
	};

	/**
	 * Validates an Active Submission combined with all Submitted Data.
	 * Active Submission is updated after validation is complete.
	 * Returns the ID of the Active Submission updated
	 * @param {number} submissionId Active Submission
	 * @returns {Promise<number>} ID of the Submission updated
	 */
	const performDataValidation = async (submissionId: number): Promise<number> => {
		const { getActiveDictionaryByCategory } = categoryRepositry;
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepository;
		const { getSubmissionDetailsById } = submissionRepository;

		// Get Active Submission from database
		const activeSubmission = await getSubmissionDetailsById(submissionId);

		if (!activeSubmission) {
			throw new Error(`Submission '${submissionId}' not found`);
		}

		// Get Submitted Data from database
		const submittedData = await getSubmittedDataByCategoryIdAndOrganization(
			activeSubmission.dictionaryCategory.id,
			activeSubmission.organization,
		);

		const currentDictionary = await getActiveDictionaryByCategory(activeSubmission.dictionaryCategory.id);
		if (!currentDictionary) {
			throw new BadRequest(`Dictionary in category '${activeSubmission.dictionaryCategory.id}' not found`);
		}

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeAndReferenceEntityData({
			submissionId,
			submissionData: activeSubmission.data,
			submittedData,
		});

		// Prepare data to validate. Extract schema data from merged data
		const crossSchemasDataToValidate = extractSchemaDataFromMergedDataRecords(dataMergedByEntityName);

		// Run validation using Lectern Client
		const resultValidation = validateSchemas(currentDictionary, crossSchemasDataToValidate);

		// Collect errors of the Active Submission
		const submissionSchemaErrors = groupSchemaErrorsByEntity({
			resultValidation,
			dataValidated: dataMergedByEntityName,
		});

		// Check for records to be updated that its systemId was not found in the Submitted Data collection.
		// Any error found will cause the submission to be marked as 'invalid'
		Object.entries(activeSubmission.data.updates ?? {}).forEach(([entityName, recordsToUpdate]) => {
			recordsToUpdate.forEach((submissionEditData, index) => {
				const found = findEditSubmittedData(entityName, submissionEditData.systemId, dataMergedByEntityName);

				if (found) {
					return;
				}

				logger.error(
					LOG_MODULE,
					`Record with systemId '${submissionEditData.systemId}' not found in entity '${entityName}'`,
				);

				if (!submissionSchemaErrors.updates) {
					submissionSchemaErrors.updates = {};
				}

				if (!submissionSchemaErrors.updates[entityName]) {
					submissionSchemaErrors.updates[entityName] = [];
				}

				const unrecodgnizedValueError: SubmissionRecordErrorDetails = {
					fieldName: 'systemId',
					fieldValue: submissionEditData.systemId,
					index,
					reason: 'UNRECOGNIZED_VALUE',
				};

				submissionSchemaErrors.updates[entityName].push(unrecodgnizedValueError);
			});
		});

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
		});
	};

	/**
	 * Void function to process and validate uploaded records on an Active Submission.
	 * Performs the schema data validation of data to be edited combined with all Submitted Data.
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
		const { getSubmissionDetailsById, update } = submissionRepository;

		try {
			// Parse file data
			const recordsParsed = records.map(convertRecordToString).map(parseToSchema(schema));

			const filesDataProcessed = await compareUpdatedData(recordsParsed, schema.name);

			const submission = await getSubmissionDetailsById(submissionId);
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

			const totalDependants = foundDependentUpdates.reduce<Record<string, SubmissionUpdateData[]>>((acc, o) => {
				return mergeUpdatesBySystemId(acc, o.dependents);
			}, {});

			// Identify what requested updates involves ID and nonID field changes
			const { idFieldChangeRecord, nonIdFieldChangeRecord } = segregateFieldChangeRecords(
				{ [schema.name]: filesDataProcessed },
				dictionaryRelations,
			);

			// Aggegates all Update changes on Submission
			// Note: We do not include records involving primary ID fields changes in here. We would rather do a DELETE and an INSERT
			const updatedActiveSubmissionData: Record<string, SubmissionUpdateData[]> = mergeUpdatesBySystemId(
				submission.data.updates ?? {},
				totalDependants,
				nonIdFieldChangeRecord,
			);

			// Creates insert and delete records based on primary ID field change records.
			const additions = await handleIdFieldChanges(idFieldChangeRecord);

			// Merge Active Submission Inserts with Edit generated new Inserts
			const mergedInserts = mergeInsertsRecords(submission.data.inserts ?? {}, additions.inserts);

			// Merge Active Submission Deletes with Edit generated new Deletes
			const mergedDeletes = mergeDeleteRecords(submission.data.deletes ?? {}, additions.deletes);

			// filter out delete records found on update records
			const filteredDeletes = filterDeletesFromUpdates(mergedDeletes, updatedActiveSubmissionData);

			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await update(submission.id, {
				data: {
					inserts: mergedInserts,
					deletes: filteredDeletes,
					updates: updatedActiveSubmissionData,
				},
				updatedBy: username,
				status: 'VALIDATING',
			});

			// Perform Schema Data validation in a worker thread
			dependencies.workerPool.dataValidation({ submissionId: submission.id });
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`There was an error processing records on entity '${schema.name}'`,
				JSON.stringify(error),
			);
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
	}) => {
		const { getSubmissionDetailsById, update } = submissionRepository;

		try {
			// Get Active Submission from database
			const activeSubmission = await getSubmissionDetailsById(submissionId);
			if (!activeSubmission) {
				throw new Error(`Submission '${activeSubmission}' not found`);
			}

			if (!isSubmissionActive(activeSubmission.status)) {
				throw new Error(`Submission '${activeSubmission.id}' is not active`);
			}

			const insertRecords = parseRecordsToInsert(records, schemasDictionary);

			// Merge Active Submission insert records with incoming TSV file data processed
			const insertActiveSubmissionData = mergeInsertsRecords(activeSubmission.data.inserts ?? {}, insertRecords);

			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await update(activeSubmission.id, {
				data: {
					inserts: insertActiveSubmissionData,
					deletes: activeSubmission.data.deletes,
					updates: activeSubmission.data.updates,
				},
				updatedBy: username,
				status: 'VALIDATING',
			});

			// Perform Schema Data validation in a worker thread
			dependencies.workerPool.dataValidation({ submissionId: activeSubmission.id });
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`There was an error processing records on submission '${submissionId}'`,
				JSON.stringify(error),
			);
		}
		logger.info(LOG_MODULE, `Finished processInsertRecordsAsync for submission ${submissionId}`);
	};

	/**
	 * Update Active Submission in database
	 * Updates the status of the Submission to 'VALID' if there is no errors, otherwise updates it to 'INVALID'
	 * @param {Object} input
	 * @param {number} input.dictionaryId The Dictionary ID of the Submission
	 * @param {number} input.idActiveSubmission ID of the Submission
	 * @param {SubmissionErrors} input.schemaErrors Array of errors on the submission
	 * @returns {Promise<number>} The ID of the updated Submission
	 */
	const updateActiveSubmission = async (input: {
		dictionaryId: number;
		idActiveSubmission: number;
		schemaErrors: SubmissionErrors;
	}): Promise<number> => {
		const { dictionaryId, idActiveSubmission, schemaErrors } = input;
		const { update } = submissionRepository;
		const newStatusSubmission =
			Object.keys(schemaErrors).length > 0 ? SUBMISSION_STATUS.INVALID : SUBMISSION_STATUS.VALID;
		// Update with new data
		const updatedActiveSubmissionId = await update(idActiveSubmission, {
			status: newStatusSubmission,
			dictionaryId: dictionaryId,
			errors: schemaErrors,
		});

		logger.info(
			LOG_MODULE,
			`Updated Active submission '${updatedActiveSubmissionId}' with status '${newStatusSubmission}'`,
		);
		return updatedActiveSubmissionId;
	};

	/**
	 * Void function to process and validate uploaded files on an Active Submission.
	 * Performs the schema data validation combined with all Submitted Data.
	 * @param {Record<string, { files: Express.Multer.File[], schema: Schema }>} fileSchemaMap Mapping the files with a schema
	 * @param {Object} params
	 * @param {number} params.categoryId Category Identifier
	 * @param {string} params.organization Organization name
	 * @param {string} params.username User who performs the action
	 * @returns {void}
	 */
	const addFilesToSubmissionAsync = async (fileSchemaMap: FileSchemaMap, params: ValidateFilesParams) => {
		const fileSummaries = Object.entries(fileSchemaMap)
			.flatMap(([_, { files, schema }]) =>
				files.map(
					(file) => `'${file.originalname}' (${bytes.format(file.size, { decimalPlaces: 2 })}, entity: ${schema.name})`,
				),
			)
			.join(', ');
		logger.info(`Processing files: ${fileSummaries}`);

		// TODO: This only gets a summary, we need to insert data into an active submission so we need all the insert statements.

		const { categoryId, organization, username } = params;

		try {
			// Parse file data
			const filesDataProcessed = await submissionInsertDataFromFiles(fileSchemaMap);

			// Get Active Submission from database
			const activeSubmission = await submissionRepository.getActiveSubmissionDetails({
				categoryId,
				username,
				organization,
			});
			if (!activeSubmission) {
				throw new BadRequest(`Submission '${activeSubmission}' not found`);
			}

			// Merge Active Submission data with incoming TSV file data processed
			const insertActiveSubmissionData = mergeInsertsRecords(activeSubmission.data.inserts ?? {}, filesDataProcessed);

			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await submissionRepository.update(activeSubmission.id, {
				data: {
					inserts: insertActiveSubmissionData,
					deletes: activeSubmission.data.deletes,
					updates: activeSubmission.data.updates,
				},
				updatedBy: username,
				status: 'VALIDATING',
			});

			// Perform Schema Data validation in a worker thread
			dependencies.workerPool.dataValidation({ submissionId: activeSubmission.id });
		} catch (error) {
			logger.error(`There was an error processing submitted files: ${fileSummaries}`, JSON.stringify(error));
		}
		logger.info(
			`Finished addFilesToSubmissionAsync for active submission in category "${params.categoryId}" for organization "${params.organization}" submitted by user "${params.username}"`,
		);
	};

	return {
		performCommitSubmissionAsync,
		performDataValidation,
		processEditRecordsAsync,
		processInsertRecordsAsync,
		updateActiveSubmission,
		addFilesToSubmissionAsync,
	};
};

export default { create: createSubmissionProcessor };
