import * as _ from 'lodash-es';

import {
	type DataRecord,
	Dictionary as SchemasDictionary,
	type DictionaryValidationError,
	DictionaryValidationRecordErrorDetails,
	type TestResult,
} from '@overture-stack/lectern-client';
import {
	type NewSubmission,
	Submission,
	SubmissionData,
	type SubmissionDeleteData,
	type SubmissionInsertData,
	type SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import systemIdGenerator from '../external/systemIdGenerator.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { getDictionarySchemaRelations, type SchemaChildNode } from '../utils/dictionarySchemaRelations.js';
import { BadRequest, InternalServerError, StatusConflict } from '../utils/errors.js';
import { tsvToJson } from '../utils/fileUtils.js';
import {
	canTransitionToClosed,
	checkEntityFieldNames,
	checkFileNames,
	extractSchemaDataFromMergedDataRecords,
	findInvalidRecordErrorsBySchemaName,
	getDependentsFilteronSubmissionUpdate,
	groupSchemaErrorsByEntity,
	mapGroupedUpdateSubmissionData,
	mergeAndReferenceEntityData,
	mergeDeleteRecords,
	mergeInsertsRecords,
	mergeUpdatesBySystemId,
	parseActiveSubmissionResponse,
	parseActiveSubmissionSummaryResponse,
	removeItemsFromSubmission,
	segregateFieldChangeRecords,
	submissionInsertDataFromFiles,
	validateSchemas,
} from '../utils/submissionUtils.js';
import {
	computeDataDiff,
	groupByEntityName,
	groupErrorsByIndex,
	groupSchemaDataByEntityName,
	hasErrorsByIndex,
	mergeSubmittedDataAndDeduplicateById,
	updateSubmittedDataArray,
} from '../utils/submittedDataUtils.js';
import {
	ActiveSubmissionSummaryResponse,
	CommitSubmissionParams,
	CommitSubmissionResult,
	CREATE_SUBMISSION_STATUS,
	CreateSubmissionResult,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	ValidateFilesParams,
} from '../utils/types.js';
import submittedDataService from './submittedDataService.js';

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	/**
	 * Runs Schema validation asynchronously and moves the Active Submission to Submitted Data
	 * @param {number} categoryId
	 * @param {number} submissionId
	 * @returns {Promise<CommitSubmissionResult>}
	 */
	const commitSubmission = async (
		categoryId: number,
		submissionId: number,
		userName: string,
	): Promise<CommitSubmissionResult> => {
		const { getSubmissionById } = submissionRepository(dependencies);
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedRepository(dependencies);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { generateIdentifier } = systemIdGenerator(dependencies);

		const submission = await getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (submission.dictionaryCategoryId !== categoryId) {
			throw new BadRequest(`Category ID provided does not match the category for the Submission`);
		}

		if (submission.status !== SUBMISSION_STATUS.VALID) {
			throw new StatusConflict('Submission does not have status VALID and cannot be committed');
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);
		if (_.isEmpty(currentDictionary)) {
			throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
		}

		const submittedDataToValidate = await getSubmittedDataByCategoryIdAndOrganization(
			categoryId,
			submission?.organization,
		);

		const entitiesToProcess = new Set<string>();

		submittedDataToValidate?.forEach((data) => entitiesToProcess.add(data.entityName));

		const insertsToValidate = submission.data?.inserts
			? Object.entries(submission.data.inserts).flatMap(([entityName, submissionData]) => {
					entitiesToProcess.add(entityName);

					return submissionData.records.map((record) => ({
						data: record,
						dictionaryCategoryId: categoryId,
						entityName,
						isValid: false, // By default, New Submitted Data is created as invalid until validation proves otherwise
						organization: submission.organization,
						originalSchemaId: submission.dictionaryId,
						lastValidSchemaId: submission.dictionaryId,
						systemId: generateIdentifier(entityName, record),
						createdBy: userName,
					}));
				})
			: [];

		const deleteDataArray = submission.data?.deletes
			? Object.entries(submission.data.deletes).flatMap(([entityName, submissionDeleteData]) => {
					entitiesToProcess.add(entityName);
					return submissionDeleteData;
				})
			: [];

		const updateDataArray =
			submission.data?.updates &&
			Object.entries(submission.data.updates).reduce<Record<string, SubmissionUpdateData>>(
				(acc, [entityName, submissionUpdateData]) => {
					entitiesToProcess.add(entityName);
					submissionUpdateData.forEach((record) => {
						acc[record.systemId] = record;
					});
					return acc;
				},
				{},
			);

		// To Commit Active Submission we need to validate SubmittedData + Active Submission
		performCommitSubmissionAsync({
			dataToValidate: {
				inserts: insertsToValidate,
				submittedData: submittedDataToValidate,
				deletes: deleteDataArray,
				updates: updateDataArray,
			},
			submission,
			dictionary: currentDictionary,
			userName: userName,
		});

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
			dictionary: {
				name: currentDictionary.name,
				version: currentDictionary.version,
			},
			processedEntities: Array.from(entitiesToProcess.values()),
		};
	};

	/**
	 * Updates Submission status to CLOSED
	 * This action is allowed only if current Submission Status as OPEN, VALID or INVALID
	 * Returns the resulting Active Submission with its status
	 * @param {number} submissionId
	 * @param {string} userName
	 * @returns {Promise<Submission | undefined>}
	 */
	const deleteActiveSubmissionById = async (
		submissionId: number,
		userName: string,
	): Promise<Submission | undefined> => {
		const { getSubmissionById, update } = submissionRepository(dependencies);

		const submission = await getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!canTransitionToClosed(submission.status)) {
			throw new StatusConflict('Only Submissions with statuses "OPEN", "VALID", "INVALID" can be deleted');
		}

		const updatedRecord = await update(submission.id, {
			status: SUBMISSION_STATUS.CLOSED,
			updatedBy: userName,
		});

		logger.info(LOG_MODULE, `Submission '${submissionId}' updated with new status '${SUBMISSION_STATUS.CLOSED}'`);

		return updatedRecord;
	};

	/**
	 * Function to remove an entity from an Active Submission by given Submission ID
	 * It validates resulting Active Submission running cross schema validation along with the existing Submitted Data
	 * Returns the resulting Active Submission with its status
	 * @param {number} submissionId
	 * @param {string} entityName
	 * @param {string} userName
	 * @returns { Promise<Submission | undefined>} Resulting Active Submittion
	 */
	const deleteActiveSubmissionEntity = async (
		submissionId: number,
		userName: string,
		filter: {
			actionType: SubmissionActionType;
			entityName: string;
			index: number | null;
		},
	): Promise<Submission | undefined> => {
		const { getSubmissionById } = submissionRepository(dependencies);

		const submission = await getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (
			SUBMISSION_ACTION_TYPE.Values.INSERTS.includes(filter.actionType) &&
			!_.has(submission.data.inserts, filter.entityName)
		) {
			throw new BadRequest(`Entity '${filter.entityName}' not found on '${filter.actionType}' Submission`);
		}

		if (
			SUBMISSION_ACTION_TYPE.Values.UPDATES.includes(filter.actionType) &&
			!_.has(submission.data.updates, filter.entityName)
		) {
			throw new BadRequest(`Entity '${filter.entityName}' not found on '${filter.actionType}' Submission`);
		}

		if (
			SUBMISSION_ACTION_TYPE.Values.DELETES.includes(filter.actionType) &&
			!_.has(submission.data.deletes, filter.entityName)
		) {
			throw new BadRequest(`Entity '${filter.entityName}' not found on '${filter.actionType}' Submission`);
		}

		// Remove entity from the Submission
		const updatedActiveSubmissionData = removeItemsFromSubmission(submission.data, {
			...filter,
		});

		const updatedRecord = await performDataValidation({
			originalSubmission: submission,
			submissionData: updatedActiveSubmissionData,
			userName,
		});

		logger.info(LOG_MODULE, `Submission '${updatedRecord.id}' updated with new status '${updatedRecord.status}'`);

		return updatedRecord;
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
		const { getSubmittedDataFiltered } = submittedRepository(dependencies);
		const { searchDirectDependents } = submittedDataService(dependencies);

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
					const filterDependents = getDependentsFilteronSubmissionUpdate(
						dictionaryRelations[submissionUpdateEntityName],
						submissionUpdateRecord,
					);

					if (filterDependents.length === 0) return { submissionUpdateData: submissionUpdateRecord, dependents: {} };

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
	 * Get an active Submission by Category
	 * @param {Object} params
	 * @param {number} params.categoryId
	 * @param {string} params.userName
	 * @returns  One Active Submission
	 */
	const getActiveSubmissionsByCategory = async ({
		categoryId,
		userName,
	}: {
		categoryId: number;
		userName: string;
	}): Promise<ActiveSubmissionSummaryResponse[] | undefined> => {
		const { getActiveSubmissionsWithRelationsByCategory } = submissionRepository(dependencies);

		const submissions = await getActiveSubmissionsWithRelationsByCategory({ userName, categoryId });
		if (!submissions || submissions.length === 0) {
			return;
		}

		return submissions.map((response) => parseActiveSubmissionSummaryResponse(response));
	};

	/**
	 * Get Active Submission by Submission ID
	 * @param {number} submissionId A Submission ID
	 * @returns One Active Submission
	 */
	const getActiveSubmissionById = async (submissionId: number) => {
		const { getActiveSubmissionWithRelationsById } = submissionRepository(dependencies);

		const submission = await getActiveSubmissionWithRelationsById(submissionId);
		if (_.isEmpty(submission)) {
			return;
		}

		return parseActiveSubmissionResponse(submission);
	};

	/**
	 * Get an active Submission by Organization
	 * @param {Object} params
	 * @param {number} params.categoryId
	 * @param {string} params.userName
	 * @param {string} params.organization
	 * @returns One Active Submission
	 */
	const getActiveSubmissionByOrganization = async ({
		categoryId,
		userName,
		organization,
	}: {
		categoryId: number;
		userName: string;
		organization: string;
	}): Promise<ActiveSubmissionSummaryResponse | undefined> => {
		const { getActiveSubmissionWithRelationsByOrganization } = submissionRepository(dependencies);

		const submission = await getActiveSubmissionWithRelationsByOrganization({ organization, userName, categoryId });
		if (_.isEmpty(submission)) {
			return;
		}

		return parseActiveSubmissionSummaryResponse(submission);
	};

	/**
	 * Find the current Active Submission or Create an Open Active Submission with initial values and no schema data.
	 * @param {object} params
	 * @param {string} params.userName Owner of the Submission
	 * @param {number} params.categoryId Category ID of the Submission
	 * @param {string} params.organization Organization name
	 * @returns {Submission} An Active Submission
	 */
	const getOrCreateActiveSubmission = async (params: {
		userName: string;
		categoryId: number;
		organization: string;
	}): Promise<Submission> => {
		const { categoryId, userName, organization } = params;
		const submissionRepo = submissionRepository(dependencies);
		const categoryRepo = categoryRepository(dependencies);

		const activeSubmission = await submissionRepo.getActiveSubmission({ categoryId, userName, organization });
		if (activeSubmission) {
			return activeSubmission;
		}

		const currentDictionary = await categoryRepo.getActiveDictionaryByCategory(categoryId);

		if (!currentDictionary) {
			throw new InternalServerError(`Dictionary in category '${categoryId}' not found`);
		}

		const newSubmissionInput: NewSubmission = {
			createdBy: userName,
			data: {},
			dictionaryCategoryId: categoryId,
			dictionaryId: currentDictionary.id,
			errors: {},
			organization: organization,
			status: SUBMISSION_STATUS.OPEN,
		};

		return submissionRepo.save(newSubmissionInput);
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

						if (!foundSubmittedData) return acc2;

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
						dataSubmittedRepo.update({
							submittedDataId: data.id,
							newData: inputUpdate,
							dataDiff: { old: submisionUpdateData?.old ?? {}, new: submisionUpdateData?.new ?? {} },
							oldIsValid: oldIsValid,
							submissionId: submission.id,
						});
					}
				} else {
					logger.info(
						LOG_MODULE,
						`Creating new submittedData in entity '${entityName}' with system ID '${data.systemId}'`,
					);
					data.isValid = newIsValid;
					dataSubmittedRepo.save(data);
				}
			});
		});

		// iterate if there are any record to be deleted
		dataToValidate?.deletes?.forEach((item) => {
			dataSubmittedRepo.deleteBySystemId({
				submissionId: submission.id,
				systemId: item.systemId,
				diff: computeDataDiff(item.data as DataRecord, null),
				userName,
			});
		});

		logger.info(LOG_MODULE, `Active submission '${submission.id} updated to status '${SUBMISSION_STATUS.COMMITED}'`);
		submissionRepo.update(submission.id, {
			status: SUBMISSION_STATUS.COMMITED,
			updatedAt: new Date(),
		});
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
	 * Construct a SubmissionUpdateData object per each file returning a Record type based on entityName
	 * @param {Record<string, Express.Multer.File>} files
	 * @param {SchemasDictionary} schemasDictionary,
	 * @returns {Promise<Record<string, SubmissionUpdateData>>}
	 */
	const submissionUpdateDataFromFiles = async (
		files: Record<string, Express.Multer.File>,
		schemasDictionary: SchemasDictionary,
	): Promise<Record<string, SubmissionUpdateData[]>> => {
		const { getSubmittedDataBySystemId } = submittedRepository(dependencies);
		const results: Record<string, SubmissionUpdateData[]> = {};

		// Process files in parallel using Promise.all
		await Promise.all(
			Object.entries(files).map(async ([entityName, file]) => {
				const schema = schemasDictionary.schemas.find((schema) => schema.name === entityName);
				if (!schema) {
					throw new Error(`No schema found for : '${entityName}'`);
				}
				const parsedFileData = await tsvToJson(file.path, schema);

				// Process records concurrently using Promise.all
				const recordPromises = parsedFileData.records.map(async (record) => {
					const systemId = record['systemId']?.toString();
					const changeData = _.omit(record, 'systemId');
					if (!systemId) return;

					const foundSubmittedData = await getSubmittedDataBySystemId(systemId);
					if (foundSubmittedData?.data) {
						const diffData = computeDataDiff(foundSubmittedData.data, changeData);
						if (!_.isEmpty(diffData.old) && !_.isEmpty(diffData.new)) {
							// Initialize an array for each entityName
							if (!results[entityName]) {
								results[entityName] = [];
							}

							results[entityName].push({
								systemId: systemId,
								old: diffData.old,
								new: diffData.new,
							});
						}
					}
				});

				// Wait for all records of the current file to be processed
				await Promise.all(recordPromises);
			}),
		);

		return results;
	};

	/**
	 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
	 * @param {object} params
	 * @param {Express.Multer.File[]} params.files An array of files
	 * @param {number} params.categoryId Category ID of the Submission
	 * @param {string} params.organization Organization name
	 * @param {string} params.userName User name creating the Submission
	 * @returns The Active Submission created or Updated
	 */
	const uploadSubmission = async ({
		files,
		categoryId,
		organization,
		userName,
	}: {
		files: Express.Multer.File[];
		categoryId: number;
		organization: string;
		userName: string;
	}): Promise<CreateSubmissionResult> => {
		logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);

		if (files.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid files for submission',
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
		const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);
		const { validFileEntity, batchErrors: fileNamesErrors } = await checkFileNames(files, schemaNames);

		if (_.isEmpty(validFileEntity)) {
			logger.info(LOG_MODULE, `No valid files for submission`);
		}

		// step 2 Validation. Validate fieldNames (missing required fields based on schema)
		const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);

		const batchErrors = [...fileNamesErrors, ...fieldNameErrors];
		const entitiesToProcess = Object.keys(checkedEntities);

		if (_.isEmpty(checkedEntities)) {
			logger.info(LOG_MODULE, 'Found errors on Submission files.', JSON.stringify(batchErrors));
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid entities in submission',
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		// Get Active Submission or Open a new one
		const activeSubmission = await getOrCreateActiveSubmission({ categoryId, userName, organization });
		const activeSubmissionId = activeSubmission.id;

		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		validateFilesAsync(checkedEntities, {
			schemasDictionary,
			categoryId,
			organization,
			userName,
		});

		if (batchErrors.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.PROCESSING,
				description: 'Submission files are being processed',
				submissionId: activeSubmissionId,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		return {
			status: CREATE_SUBMISSION_STATUS.PARTIAL_SUBMISSION,
			description: 'Some Submission files are being processed while others were unable to process',
			submissionId: activeSubmissionId,
			batchErrors,
			inProcessEntities: entitiesToProcess,
		};
	};

	/**
	 * Void function to process and validate uploaded files on an Active Submission.
	 * Performs the schema data validation of data to be edited combined with all Submitted Data.
	 * @param params
	 * @param params.files Uploaded files to be processed
	 * @param params.schemasDictionary Dictionary to parse data with
	 * @param params.submission A `Submission` object representing the Active Submission
	 * @param params.userName User who performs the action
	 */
	const processEditFilesAsync = async ({
		files,
		schemasDictionary,
		submission,
		userName,
	}: {
		files: Record<string, Express.Multer.File>;
		schemasDictionary: SchemasDictionary;
		submission: Submission;
		userName: string;
	}): Promise<void> => {
		const { getDictionaryById } = dictionaryRepository(dependencies);

		// Parse file data
		const filesDataProcessed = await submissionUpdateDataFromFiles(files, schemasDictionary);
		logger.info(
			LOG_MODULE,
			`Read '${Object.values(filesDataProcessed).length}' records in total on files '${Object.keys(files)}'`,
		);

		const currentDictionary = await getDictionaryById(submission.dictionaryId);
		if (!currentDictionary) {
			throw new BadRequest(`Dictionary in category '${submission.dictionaryCategoryId}' not found`);
		}

		// get dictionary relations
		const dictionaryRelations = getDictionarySchemaRelations(currentDictionary);

		const foundDependentUpdates = await findUpdateDependents({
			dictionaryRelations,
			organization: submission.organization,
			submissionUpdateData: filesDataProcessed,
		});

		logger.info(
			LOG_MODULE,
			`Direct dependency found: ${foundDependentUpdates.map(({ submissionUpdateData, dependents }) => `'${Object.values(dependents).length}' dependents on system ID '${submissionUpdateData.systemId}'`)}`,
		);

		const totalDependants = foundDependentUpdates.reduce<Record<string, SubmissionUpdateData[]>>((acc, o) => {
			return mergeUpdatesBySystemId(acc, o.dependents);
		}, {});

		// Identify what requested updates involves ID and nonID field changes
		const { idFieldChangeRecord, nonIdFieldChangeRecord } = segregateFieldChangeRecords(
			filesDataProcessed,
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

		// Perform Schema Data validation Async.
		performDataValidation({
			originalSubmission: submission,
			submissionData: {
				inserts: mergedInserts,
				deletes: mergedDeletes,
				updates: updatedActiveSubmissionData,
			},
			userName,
		});
	};

	/**
	 * Void function to process and validate uploaded files on an Active Submission.
	 * Performs the schema data validation combined with all Submitted Data.
	 * @param {Record<string, Express.Multer.File>} files Uploaded files to be processed
	 * @param {Object} params
	 * @param {number} params.categoryId Category Identifier
	 * @param {string} params.organization Organization name
	 * @param {SchemasDictionary} params.schemasDictionary Dictionary to parse files with
	 * @param {string} params.userName User who performs the action
	 * @returns {void}
	 */
	const validateFilesAsync = async (files: Record<string, Express.Multer.File>, params: ValidateFilesParams) => {
		const { getActiveSubmission } = submissionRepository(dependencies);

		const { categoryId, organization, userName, schemasDictionary } = params;

		// Parse file data
		const filesDataProcessed = await submissionInsertDataFromFiles(files, schemasDictionary);

		// Get Active Submission from database
		const activeSubmission = await getActiveSubmission({ categoryId, userName, organization });
		if (!activeSubmission) {
			throw new BadRequest(`Submission '${activeSubmission}' not found`);
		}

		// Merge Active Submission data with incoming TSV file data processed
		const insertActiveSubmissionData = mergeInsertsRecords(activeSubmission.data.inserts ?? {}, filesDataProcessed);

		// Perform Schema Data validation Async.
		performDataValidation({
			originalSubmission: activeSubmission,
			submissionData: {
				inserts: insertActiveSubmissionData,
				deletes: activeSubmission.data.deletes,
				updates: activeSubmission.data.updates,
			},
			userName,
		});
	};

	return {
		commitSubmission,
		deleteActiveSubmissionById,
		deleteActiveSubmissionEntity,
		getActiveSubmissionsByCategory,
		getActiveSubmissionById,
		getActiveSubmissionByOrganization,
		getOrCreateActiveSubmission,
		performDataValidation,
		processEditFilesAsync,
		uploadSubmission,
	};
};

export default service;
