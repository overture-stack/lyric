import bytes from 'bytes';
import * as _ from 'lodash-es';

import type { DataRecord, DictionaryValidationRecordErrorDetails, Schema } from '@overture-stack/lectern-client';
import type {
	DataDiff,
	NewSubmittedData,
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import createSubmissionRepository from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import createDictionaryRepository from '../../repository/dictionaryRepository.js';
import createSubmissionFilesRepository from '../../repository/submissionFilesRepository.js';
import createSubmissionRecordsRepository from '../../repository/submissionRecordsRepository.js';
import createSubmittedDataRepository from '../../repository/submittedRepository.js';
import { getDictionarySchemaRelations, type SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { BadRequest } from '../../utils/errors.js';
import { convertRecordToString } from '../../utils/formatUtils.js';
import { parseRecordsToInsert } from '../../utils/recordsParser.js';
import {
	extractSchemaDataFromMergedDataRecords,
	type FileParseResult,
	filterRelationsForPrimaryIdUpdate,
	findInvalidRecordErrorsBySchemaName,
	groupSchemaErrorsByEntity,
	isSubmissionActive,
	mapGroupedUpdateSubmissionData,
	mergeAndReferenceEntityData,
	mergeUpdatesBySystemId,
	parseToSchema,
	segregateFieldChangeRecords,
	type SubmissionErrors,
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
} from '../../utils/types.js';
import createSubmittedDataRelationsSearch from '../submittedData/searchDataRelations.js';

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
	 * then generates a record to be deleted and to be inserted.
	 * The resulting inserts and deletes are organized by entity names.
	 * @param idFieldChangeRecord Records that are changing ID fields
	 * @returns
	 */
	const handleIdFieldChanges = async (idFieldChangeRecord: Record<string, SubmissionUpdateData[]>) => {
		const { getSubmittedDataBySystemId } = submittedDataRepository;

		return Object.entries(idFieldChangeRecord).reduce<
			Promise<{
				inserts: Record<string, SubmissionInsertData[]>;
				deletes: Record<string, SubmissionDeleteData[]>;
			}>
		>(
			async (accPromise, [entityName, updRecord]) => {
				const acc = await accPromise;

				// iterate each record on this entity
				const result = await updRecord.reduce<
					Promise<{
						inserts: SubmissionInsertData[];
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
							isValid: foundSubmittedData.isValid,
							organization: foundSubmittedData.organization,
						};

						const insertDataRecord: SubmissionInsertData = { ...foundSubmittedData.data, ...u.new };

						acc2.inserts.push(insertDataRecord);
						acc2.deletes.push(deleteRecord);
						return acc2;
					},
					Promise.resolve({ inserts: [], deletes: [] }),
				);

				acc.deletes[entityName] = result.deletes;
				acc.inserts[entityName] = result.inserts;

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
			dataToValidate?.deletes?.forEach((item) => {
				const { data, isValid, organization, systemId } = item;

				deletesToProcess.push({
					submissionId: submission.id,
					systemId,
					diff: computeDataDiff(data, null),
					username,
				});

				resultCommit.deletes.push({
					data,
					entityName: '', // TODO: need to fetch the entityName
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
	 * Returns the ID of the Active Submission updated
	 * @param {number} submissionId Active Submission
	 * @returns {Promise<number>} ID of the Submission updated
	 */
	const performDataValidation = async (submissionId: number): Promise<number> => {
		const { getActiveDictionaryByCategory } = categoryRepository;
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepository;
		const { getSubmissionById } = submissionRepository;

		// Get Active Submission from database
		const activeSubmission = await getSubmissionById(submissionId);

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

		const submissionRecords = await submissionRecordsRepository.getBySubmissionId(submissionId);

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeAndReferenceEntityData({
			submissionId,
			submissionData: submissionRecords,
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
		const { getSubmissionById, update } = submissionRepository;

		try {
			// Parse file data
			const recordsParsed = records.map(convertRecordToString).map(parseToSchema(schema));

			const filesDataProcessed = await compareUpdatedData(recordsParsed, schema.name);

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

			const totalDependants = foundDependentUpdates.reduce<Record<string, SubmissionUpdateData[]>>((acc, o) => {
				return mergeUpdatesBySystemId(acc, o.dependents);
			}, {});

			// Identify what requested updates involves ID and nonID field changes
			const { idFieldChangeRecord, nonIdFieldChangeRecord } = segregateFieldChangeRecords(
				{ [schema.name]: filesDataProcessed },
				dictionaryRelations,
			);

			// const submissionRecordsToUpdate = await submissionRecordsRepository.getBySubmissionId(submissionId, undefined, {
			// 	actionTypes: ['UPDATE'],
			// });

			// const formattedSubmissionRecordsToUpdate = submissionRecordsToUpdate
			// 	.filter(
			// 		(
			// 			record,
			// 		): record is (typeof submissionRecordsToUpdate)[number] & {
			// 			actionType: 'UPDATE';
			// 			data: SubmissionUpdateData;
			// 		} => record.actionType === 'UPDATE',
			// 	)
			// 	.reduce<Record<string, SubmissionUpdateData[]>>((acc, record) => {
			// 		if (!acc[record.entityName]) {
			// 			acc[record.entityName] = [];
			// 		}

			// 		(acc[record.entityName] ?? []).push({
			// 			systemId: record.data.systemId.toString(),
			// 			old: record.data.old ?? {},
			// 			new: record.data.new ?? {},
			// 		});
			// 		return acc;
			// 	}, {});

			// Aggegates all Update changes on Submission
			// Note: We do not include records involving primary ID fields changes in here. We would rather do a DELETE and an INSERT
			const updatedActiveSubmissionData: Record<string, SubmissionUpdateData[]> = mergeUpdatesBySystemId(
				// formattedSubmissionRecordsToUpdate,
				totalDependants,
				nonIdFieldChangeRecord,
			);

			// Creates insert and delete records based on primary ID field change records.
			const additions = await handleIdFieldChanges(idFieldChangeRecord);

			// // Merge Active Submission Inserts with Edit generated new Inserts
			// const mergedInserts = mergeInsertsRecords(submission.data.inserts ?? {}, additions.inserts);

			// // Merge Active Submission Deletes with Edit generated new Deletes
			// const mergedDeletes = mergeDeleteRecords(submission.data.deletes ?? {}, additions.deletes);

			// // filter out delete records found on update records
			// const filteredDeletes = filterDeletesFromUpdates(mergedDeletes, updatedActiveSubmissionData);

			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await update(submission.id, {
				updatedBy: username,
				status: 'VALIDATING',
			});

			// TODO insert new data into submissionRecordsRepository, remove the code above to merge
			// insert new file for submission

			const entityNames: Set<string> = new Set([
				...Object.keys(additions.inserts),
				...Object.keys(additions.deletes),
				...Object.keys(updatedActiveSubmissionData),
			]);

			for (const entityName of entityNames) {
				const savedFileId = await submissionFilesRepository.save({
					entityName: entityName,
					fileName: `${Date.now()}.json`,
					fileSize: 0,
					submissionId: submission.id,
				});

				if (updatedActiveSubmissionData[entityName]) {
					await submissionRecordsRepository.saveManyForFile(
						savedFileId,
						updatedActiveSubmissionData[entityName].map((record) => ({
							actionType: 'UPDATE',
							data: record,
							state: 'RECEIVED',
							fileId: savedFileId,
						})),
					);
				}

				if (additions.inserts[entityName]) {
					await submissionRecordsRepository.saveManyForFile(
						savedFileId,
						additions.inserts[entityName].map((record) => ({
							actionType: 'INSERT',
							data: record,
							state: 'RECEIVED',
							fileId: savedFileId,
						})),
					);
				}
				if (additions.deletes[entityName]) {
					await submissionRecordsRepository.saveManyForFile(
						savedFileId,
						additions.deletes[entityName]?.map((record) => ({
							actionType: 'DELETE',
							data: record,
							state: 'RECEIVED',
						})),
					);
				}
			}

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
		const { getSubmissionById, update } = submissionRepository;

		try {
			// Get Active Submission from database
			const activeSubmission = await getSubmissionById(submissionId);
			if (!activeSubmission) {
				throw new Error(`Submission '${submissionId}' not found`);
			}

			if (!isSubmissionActive(activeSubmission.status)) {
				throw new Error(`Submission '${activeSubmission.id}' is not active`);
			}

			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await update(activeSubmission.id, {
				updatedBy: username,
				status: 'VALIDATING',
			});

			const insertRecords = parseRecordsToInsert(records, schemasDictionary);

			await Promise.all(
				Object.entries(insertRecords).map(async ([entityName, entityRecords]) => {
					const savedFileId = await submissionFilesRepository.save({
						entityName,
						fileName: `insert-${entityName}-${Date.now()}.json`, // default file name for adding JSON records
						fileSize: JSON.stringify(entityRecords).length,
						submissionId,
					});
					await submissionRecordsRepository.saveManyForFile(
						savedFileId,
						entityRecords.map((record) => ({
							actionType: 'INSERT',
							data: record,
							state: 'RECEIVED',
						})),
					);
				}),
			);

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
	 * Updates the Submission status to 'VALID' if there is no errors, otherwise updates it to 'INVALID'
	 * Updates all the records of the submission with the validation state, marking records with errors as 'INVALID'
	 * and records without errors as 'VALID'
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
		});

		const invalidRecords = Object.values(schemaErrors).flatMap((entityErrors) =>
			Object.values(entityErrors).flatMap((recordErrors) =>
				recordErrors.map(({ recordId, errors }) => ({
					id: recordId,
					errors,
				})),
			),
		);

		const submissionRecords = await submissionRecordsRepository.getBySubmissionId(idActiveSubmission);
		const recordsWithoutError = submissionRecords
			.filter((record) => !invalidRecords.some((invalidRecord) => invalidRecord.id === record.id))
			.map((record) => record.id);

		submissionRecordsRepository.updateValidationState({
			invalidRecords,
			validRecordIds: recordsWithoutError,
		});

		logger.info(
			LOG_MODULE,
			`Updated Active submission '${updatedActiveSubmissionId}' with status '${newStatusSubmission}'`,
		);
		return updatedActiveSubmissionId;
	};

	const logFileResult = (result: FileParseResult) => {
		if (result.status === 'error') {
			logger.error(LOG_MODULE, `Failed to parse file`, {
				fileName: result.fileName,
				fileSize: bytes.format(result.fileSize, { decimalPlaces: 2 }),
				entityName: result.entityName,
				error: result.streamError,
			});
		} else if (result.status === 'invalid') {
			// Log field names and line numbers only — not field values (OWASP A03).
			logger.warn(LOG_MODULE, `File parsed with schema validation issues`, {
				fileName: result.fileName,
				fileSize: bytes.format(result.fileSize, { decimalPlaces: 2 }),
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
	 * Processes and validates uploaded files on an Active Submission.
	 * File parsing is fault-isolated per file. Schema validation runs in a background worker thread.
	 * @param {FileSchemaMap} fileSchemaMap Mapping of files to their resolved entity and schema
	 * @param {ValidateFilesParams} params categoryId, organization, username
	 * @returns Per-file parse results, available immediately; validation results arrive later via the worker.
	 */
	const addFilesToSubmissionAsync = async (
		fileSchemaMap: FileSchemaMap,
		submissionId: number,
		username: string,
	): Promise<FileParseResult[]> => {
		const fileResult: FileParseResult[] = [];

		try {
			// Updating the Submission with the new data and 'VALIDATING' status before validation starts
			await submissionRepository.update(submissionId, {
				updatedBy: username,
				status: 'VALIDATING',
			});

			// Parse file data — each file is isolated; a failure on one does not block others.
			const parsingFileDataResult = await submissionInsertDataFromFiles(fileSchemaMap);

			for (const fileProcessed of parsingFileDataResult) {
				logFileResult(fileProcessed.fileResult);
				const {
					data,
					fileResult: { entityName, fileName, fileSize, status },
				} = fileProcessed;
				fileResult.push(fileProcessed.fileResult);

				if (status === 'ok') {
					dependencies.db.transaction(async (tx) => {
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
							data.map((record) => ({
								actionType: 'INSERT',
								data: record,
								state: 'RECEIVED',
							})),
							tx,
						);
					});
				}
			}

			// Perform Schema Data validation in a worker thread
			dependencies.workerPool.dataValidation({ submissionId: submissionId });
		} catch (error) {
			logger.error(LOG_MODULE, `Error processing submitted files`, {
				error: error instanceof Error ? error.message : String(error),
				errorType: error instanceof Error ? error.name : 'unknown',
			});
		}
		logger.info(
			LOG_MODULE,
			`Finished addFilesToSubmissionAsync for active submission with ID "${submissionId}" submitted by user "${username}"`,
		);

		return fileResult;
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
