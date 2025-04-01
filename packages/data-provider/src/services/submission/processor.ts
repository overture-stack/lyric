import * as _ from 'lodash-es';

import { type DataRecord, DictionaryValidationRecordErrorDetails, type Schema } from '@overture-stack/lectern-client';
import {
	Submission,
	SubmissionData,
	type SubmissionDeleteData,
	type SubmissionInsertData,
	type SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import submissionRepository from '../../repository/activeSubmissionRepository.js';
import categoryRepository from '../../repository/categoryRepository.js';
import dictionaryRepository from '../../repository/dictionaryRepository.js';
import submittedRepository from '../../repository/submittedRepository.js';
import { getDictionarySchemaRelations, type SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { BadRequest } from '../../utils/errors.js';
import { convertRecordToString } from '../../utils/formatUtils.js';
import {
	extractSchemaDataFromMergedDataRecords,
	filterDeletesFromUpdates,
	filterRelationsForPrimaryIdUpdate,
	findInvalidRecordErrorsBySchemaName,
	groupSchemaErrorsByEntity,
	mapGroupedUpdateSubmissionData,
	mergeAndReferenceEntityData,
	mergeDeleteRecords,
	mergeInsertsRecords,
	mergeUpdatesBySystemId,
	parseToSchema,
	segregateFieldChangeRecords,
	validateSchemas,
} from '../../utils/submissionUtils.js';
import {
	computeDataDiff,
	groupByEntityName,
	groupErrorsByIndex,
	groupSchemaDataByEntityName,
	hasErrorsByIndex,
	mergeSubmittedDataAndDeduplicateById,
	updateSubmittedDataArray,
} from '../../utils/submittedDataUtils.js';
import {
	CommitSubmissionParams,
	SUBMISSION_STATUS,
	type SubmittedDataResponse,
	type ValidateFilesParams,
} from '../../utils/types.js';
import searchDataRelations from '../submittedData/searchDataRelations.js';

const processor = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_PROCESSOR_SERVICE';
	const { logger } = dependencies;

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
		const { getSubmittedDataFiltered } = submittedRepository(dependencies);
		const { searchDirectDependents } = searchDataRelations(dependencies);

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
		const { getSubmittedDataBySystemId } = submittedRepository(dependencies);
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
	 * This function validates whole data together against a dictionary
	 * @param params
	 * @param params.dataToValidate Data to be validated, This object contains:
	 * - `inserts`: An array of new records to be commited. Optional
	 * - `submittedData`: An array of existing Submitted Data. Optional
	 * - `deletes`: An array of `systemId`s representing items that should be deleted. Optional
	 * - `updates`: An array of records to be updated. Optional
	 * @param params.dictionary A `Dictionary` object for Data Validation
	 * @param params.submission A `Submission` object representing the Active Submission
	 * @param params.userName User who performs the action
	 * @returns void
	 */
	const performCommitSubmissionAsync = async (params: CommitSubmissionParams): Promise<void> => {
		const submissionRepo = submissionRepository(dependencies);
		const dataSubmittedRepo = submittedRepository(dependencies);

		const { dictionary, dataToValidate, submission, userName } = params;

		// Merge Submitted Data with items to be inserted, updated or deleted consist on 3 steps
		// Step 1: Exclude items that are marked for deletion
		const systemIdsToDelete = new Set<string>(dataToValidate?.deletes?.map((item) => item.systemId) || []);
		logger.info(LOG_MODULE, `Found '${systemIdsToDelete.size}' Records to delete on Submission '${submission.id}'`);
		const submittedData = dataToValidate.submittedData?.filter((item) => !systemIdsToDelete.has(item.systemId));

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

		const resultCommit: {
			inserts: SubmittedDataResponse[];
			updates: SubmittedDataResponse[];
			deletes: SubmittedDataResponse[];
		} = {
			inserts: [],
			updates: [],
			deletes: [],
		};

		await dependencies.db.transaction(async (tx) => {
			Object.entries(schemasDataToValidate.submittedDataByEntityName).forEach(([entityName, dataArray], index) => {
				dataArray.forEach((data) => {
					const invalidRecordErrors = findInvalidRecordErrorsBySchemaName(resultValidation, entityName);
					const hasErrorByIndex = groupErrorsByIndex(invalidRecordErrors);
					const oldIsValid = data.isValid;
					const newIsValid = !hasErrorsByIndex(hasErrorByIndex, index);
					if (data.id) {
						const inputUpdate: Partial<SubmittedData> = {};
						const submisionUpdateData = dataToValidate.updates && dataToValidate.updates[data.systemId];
						if (submisionUpdateData) {
							logger.info(LOG_MODULE, `Updating submittedData system ID '${data.systemId}' in entity '${entityName}'`);
							inputUpdate.data = data.data;
						}

						if (oldIsValid !== newIsValid) {
							inputUpdate.isValid = newIsValid;
							if (newIsValid) {
								logger.info(
									LOG_MODULE,
									`Updating submittedData system ID '${data.systemId}' as Valid in entity '${entityName}'`,
								);
								inputUpdate.lastValidSchemaId = dictionary.id;
							}
							logger.info(
								LOG_MODULE,
								`Updating submittedData system ID '${data.systemId}' as invalid in entity '${entityName}'`,
							);
						}

						if (Object.values(inputUpdate)) {
							inputUpdate.updatedBy = userName;
							if (newIsValid) {
								inputUpdate.lastValidSchemaId = dictionary.id;
							}
							dataSubmittedRepo.update(
								{
									submittedDataId: data.id,
									newData: inputUpdate,
									dataDiff: { old: submisionUpdateData?.old ?? {}, new: submisionUpdateData?.new ?? {} },
									oldIsValid: oldIsValid,
									submissionId: submission.id,
								},
								tx,
							);

							// Check if either 'data' or 'isValid' keys has been updated
							if ('data' in inputUpdate || 'isValid' in inputUpdate) {
								resultCommit.updates.push({
									isValid: newIsValid,
									entityName,
									organization: data.organization,
									data: data.data,
									systemId: data.systemId,
								});
							}
						}
					} else {
						logger.info(
							LOG_MODULE,
							`Creating new submittedData in entity '${entityName}' with system ID '${data.systemId}'`,
						);
						data.isValid = newIsValid;
						if (newIsValid) {
							data.lastValidSchemaId = dictionary.id;
						}
						dataSubmittedRepo.save(data, tx);

						resultCommit.inserts.push({
							isValid: newIsValid,
							entityName,
							organization: data.organization,
							data: data.data,
							systemId: data.systemId,
						});
					}
				});
			});

			// iterate if there are any record to be deleted
			dataToValidate?.deletes?.forEach((item) => {
				dataSubmittedRepo.deleteBySystemId(
					{
						submissionId: submission.id,
						systemId: item.systemId,
						diff: computeDataDiff(item.data, null),
						userName,
					},
					tx,
				);

				resultCommit.deletes.push({
					isValid: item.isValid,
					entityName: item.entityName,
					organization: item.organization,
					data: item.data,
					systemId: item.systemId,
				});
			});

			logger.info(LOG_MODULE, `Active submission '${submission.id} updated to status '${SUBMISSION_STATUS.COMMITED}'`);
			submissionRepo.update(submission.id, {
				status: SUBMISSION_STATUS.COMMITED,
				updatedAt: new Date(),
			});
		});

		if (params.onFinishCommit) {
			params.onFinishCommit({
				submissionId: submission.id,
				organization: submission.organization,
				categoryId: submission.dictionaryCategoryId,
				data: resultCommit,
			});
		}
	};

	/**
	 * Validates an Active Submission combined with all Submitted Data.
	 * Active Submission is updated after validation is complete.
	 * Returns the Active Submission updated
	 * @param {Object} input
	 * @param {Submission} input.originalSubmission Active Submission
	 * @param {SubmissionData} input.submissionData New Submission data
	 * @param {string} input.username User who performs the action
	 * @returns {Promise<Submission>}
	 */
	const performDataValidation = async (input: {
		originalSubmission: Submission;
		submissionData: SubmissionData;
		userName: string;
	}): Promise<Submission> => {
		const { originalSubmission, submissionData, userName } = input;

		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedRepository(dependencies);

		// Get Submitted Data from database
		const submittedData = await getSubmittedDataByCategoryIdAndOrganization(
			originalSubmission.dictionaryCategoryId,
			originalSubmission.organization,
		);

		const currentDictionary = await getActiveDictionaryByCategory(originalSubmission.dictionaryCategoryId);
		if (!currentDictionary) {
			throw new BadRequest(`Dictionary in category '${originalSubmission.dictionaryCategoryId}' not found`);
		}

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeAndReferenceEntityData({
			originalSubmission,
			submissionData,
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
			idActiveSubmission: originalSubmission.id,
			submissionData: {
				inserts: submissionData.inserts,
				deletes: submissionData.deletes,
				updates: submissionData.updates,
			},
			schemaErrors: submissionSchemaErrors,
			dictionaryId: currentDictionary.id,
			userName: userName,
		});
	};

	/**
	 * Void function to process and validate uploaded records on an Active Submission.
	 * Performs the schema data validation of data to be edited combined with all Submitted Data.
	 * @param records Records to be processed
	 * @param params
	 * @param params.schema Schema to parse data with
	 * @param params.submission A `Submission` object representing the Active Submission
	 * @param params.userName User who performs the action
	 */
	const processEditRecordsAsync = async (
		records: Record<string, unknown>[],
		{
			schema,
			submission,
			userName,
		}: {
			schema: Schema;
			submission: Submission;
			userName: string;
		},
	): Promise<void> => {
		const { getDictionaryById } = dictionaryRepository(dependencies);

		try {
			// Parse file data
			const recordsParsed = records.map(convertRecordToString).map(parseToSchema(schema));

			const filesDataProcessed = await compareUpdatedData(recordsParsed);

			const currentDictionary = await getDictionaryById(submission.dictionaryId);
			if (!currentDictionary) {
				throw new BadRequest(`Dictionary in category '${submission.dictionaryCategoryId}' not found`);
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

			// Perform Schema Data validation Async.
			performDataValidation({
				originalSubmission: submission,
				submissionData: {
					inserts: mergedInserts,
					deletes: filteredDeletes,
					updates: updatedActiveSubmissionData,
				},
				userName,
			});
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
	 * Processes a list of data records and compares them with previously submitted data.
	 * @param {DataRecord[]} records An array of data records to be processed
	 * @returns {Promise<SubmissionUpdateData[]>} An array of `SubmissionUpdateData` objects. Each object
	 *          contains the `systemId`, `old` data, and `new` data representing the differences
	 *          between the previously submitted data and the updated record.
	 */
	const compareUpdatedData = async (records: DataRecord[]): Promise<SubmissionUpdateData[]> => {
		const { getSubmittedDataBySystemId } = submittedRepository(dependencies);
		const results: SubmissionUpdateData[] = [];

		const promises = records.map(async (record) => {
			const systemId = record['systemId']?.toString();
			if (!systemId) {
				return;
			}

			const foundSubmittedData = await getSubmittedDataBySystemId(systemId);
			if (foundSubmittedData?.data) {
				const changeData = _.omit(record, 'systemId');
				const diffData = computeDataDiff(foundSubmittedData.data, changeData);
				if (!_.isEmpty(diffData.old) && !_.isEmpty(diffData.new)) {
					results.push({
						systemId: systemId,
						old: diffData.old,
						new: diffData.new,
					});
				}
			}
			return;
		});

		// Wait for all records to be processed
		await Promise.all(promises);

		return results;
	};

	/**
	 * Update Active Submission in database
	 * @param {Object} input
	 * @param {number} input.dictionaryId The Dictionary ID of the Submission
	 * @param {SubmissionData} input.submissionData Data to be submitted grouped on inserts, updates and deletes
	 * @param {number} input.idActiveSubmission ID of the Active Submission
	 * @param {Record<string, Record<string, DictionaryValidationRecordErrorDetails[]>>} input.schemaErrors Array of schemaErrors
	 * @param {string} input.userName User updating the active submission
	 * @returns {Promise<Submission>} An Active Submission updated
	 */
	const updateActiveSubmission = async (input: {
		dictionaryId: number;
		submissionData: SubmissionData;
		idActiveSubmission: number;
		schemaErrors: Record<string, Record<string, DictionaryValidationRecordErrorDetails[]>>;
		userName: string;
	}): Promise<Submission> => {
		const { dictionaryId, submissionData, idActiveSubmission, schemaErrors, userName } = input;
		const { update } = submissionRepository(dependencies);
		const newStatusSubmission =
			Object.keys(schemaErrors).length > 0 ? SUBMISSION_STATUS.INVALID : SUBMISSION_STATUS.VALID;
		// Update with new data
		const updatedActiveSubmission = await update(idActiveSubmission, {
			data: submissionData,
			status: newStatusSubmission,
			dictionaryId: dictionaryId,
			updatedBy: userName,
			errors: schemaErrors,
		});

		logger.info(
			LOG_MODULE,
			`Updated Active submission '${updatedActiveSubmission.id}' with status '${newStatusSubmission}' on category '${updatedActiveSubmission.dictionaryCategoryId}'`,
		);
		return updatedActiveSubmission;
	};

	/**
	 * Void function to process and validate records on an Active Submission.
	 * Performs the schema data validation combined with all Submitted Data.
	 * @param {Record<string, unknown>} records Records to be processed
	 * @param {Object} params
	 * @param {number} params.categoryId Category Identifier
	 * @param {string} params.organization Organization name
	 * @param {Schema} params.schema Schema to validate records with
	 * @param {string} params.userName User who performs the action
	 * @returns {void}
	 */
	const validateRecordsAsync = async (records: Record<string, unknown>[], params: ValidateFilesParams) => {
		const { getActiveSubmission } = submissionRepository(dependencies);

		const { categoryId, organization, userName, schema } = params;

		try {
			// Get Active Submission from database
			const activeSubmission = await getActiveSubmission({ categoryId, userName, organization });
			if (!activeSubmission) {
				throw new BadRequest(`Submission '${activeSubmission}' not found`);
			}

			const recordsParsed = records.map(convertRecordToString).map(parseToSchema(schema));

			const insertRecords: Record<string, SubmissionInsertData> = {
				[schema.name]: {
					batchName: schema.name,
					records: recordsParsed,
				},
			};

			// Merge Active Submission data with incoming TSV file data processed
			const insertActiveSubmissionData = mergeInsertsRecords(activeSubmission.data.inserts ?? {}, insertRecords);

			// Perform Schema Data validation Async.
			await performDataValidation({
				originalSubmission: activeSubmission,
				submissionData: {
					inserts: insertActiveSubmissionData,
					deletes: activeSubmission.data.deletes,
					updates: activeSubmission.data.updates,
				},
				userName,
			});
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`There was an error processing records on entity '${schema.name}'`,
				JSON.stringify(error),
			);
		}
		logger.info(LOG_MODULE, `Finished validating files`);
	};

	return {
		processEditRecordsAsync,
		performCommitSubmissionAsync,
		performDataValidation,
		updateActiveSubmission,
		validateRecordsAsync,
	};
};

export default processor;
