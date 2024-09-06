import * as _ from 'lodash-es';

import {
	type NewSubmission,
	Submission,
	SubmissionData,
	type SubmissionInsertData,
	type SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model';
import {
	BatchProcessingResult,
	type DataRecord,
	SchemasDictionary,
	SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import systemIdGenerator from '../external/systemIdGenerator.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { BadRequest, InternalServerError, StatusConflict } from '../utils/errors.js';
import { tsvToJson } from '../utils/fileUtils.js';
import {
	canTransitionToClosed,
	checkEntityFieldNames,
	checkFileNames,
	determineIfIsSubmission,
	extractSchemaDataFromMergedDataRecords,
	mapInsertDataToRecordReferences,
	parseActiveSubmissionResponse,
	parseActiveSubmissionSummaryResponse,
	removeItemsFromSubmission,
	submissionInsertDataFromFiles,
	validateSchemas,
} from '../utils/submissionUtils.js';
import {
	computeDataDiff,
	groupErrorsByIndex,
	groupSchemaDataByEntityName,
	hasErrorsByIndex,
	mapAndMergeSubmittedDataToRecordReferences,
	updateSubmittedDataArray,
} from '../utils/submittedDataUtils.js';
import {
	ActiveSubmissionSummaryResponse,
	CommitSubmissionParams,
	CommitSubmissionResult,
	CREATE_SUBMISSION_STATUS,
	CreateSubmissionResult,
	DataRecordReference,
	MERGE_REFERENCE_TYPE,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	ValidateFilesParams,
} from '../utils/types.js';

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

		// TODO: Detect Conflict on SystemId's. Cases to consider:
		// same user edits or deletes same record
		// two users have edits to different fields in the same entity
		// two users have edits to the SAME field in the same entity
		// two users are submitting entities with the same unique key values
		// multiple users delete the same entity

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
	 * Returns only the schema errors corresponding to the Active Submission.
	 * Schema errors are grouped by Entity name.
	 * @param {object} input
	 * @param {Record<string, BatchProcessingResult>} input.resultValidation
	 * @param {Record<string, DataRecordReference[]>} input.dataValidated
	 * @returns {Record<string, Record<string, SchemaValidationError[]>>}
	 */
	const groupSchemaErrorsByEntity = (input: {
		resultValidation: Record<string, BatchProcessingResult>;
		dataValidated: Record<string, DataRecordReference[]>;
	}): Record<string, Record<string, SchemaValidationError[]>> => {
		const { resultValidation, dataValidated } = input;

		const submissionSchemaErrors: Record<string, Record<string, SchemaValidationError[]>> = {};
		Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
			const hasErrorByIndex = groupErrorsByIndex(validationErrors);

			if (!_.isEmpty(hasErrorByIndex)) {
				Object.entries(hasErrorByIndex).map(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
					const mapping = dataValidated[entityName][Number(indexBasedOnCrossSchemas)];
					if (determineIfIsSubmission(mapping.reference)) {
						const submissionIndex = mapping.reference.index;
						const actionType =
							mapping.reference.type === MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA ? 'inserts' : 'updates';
						logger.error(
							LOG_MODULE,
							`Error found on '${actionType}' entity '${entityName}' index '${submissionIndex}'`,
						);

						const mutableSchemaValidationErrors: SchemaValidationError[] = schemaValidationErrors.map((errors) => {
							return {
								...errors,
								index: submissionIndex,
							};
						});

						if (!submissionSchemaErrors[actionType]) {
							submissionSchemaErrors[actionType] = {};
						}

						if (!submissionSchemaErrors[actionType][entityName]) {
							submissionSchemaErrors[actionType][entityName] = [];
						}

						submissionSchemaErrors[actionType][entityName].push(...mutableSchemaValidationErrors);
					}
				});
			}
		});
		return submissionSchemaErrors;
	};

	/**
	 * Combines **Active Submission** and the **Submitted Data** recevied as arguments.
	 * Then, the Schema Data is extracted and mapped with its internal reference ID.
	 * The returned Object is a collection of the raw Schema Data with it's reference ID grouped by entity name.
	 * @param {SubmittedData[]} submittedData An array of Submitted Data
	 * @param {Object} activeSubmission
	 * @param {Record<string, SubmissionInsertData>} activeSubmission.insertData Collection of Data records of the Active Submission
	 * @param {Record<string, SubmissionUpdateData[]>} activeSubmission.updateData Collection of Data records of the Active Submission
	 * @param {Record<string, SubmissionDeleteData[]>} activeSubmission.deleteData Collection of Data records of the Active Submission
	 * @param {number} activeSubmission.id ID of the Active Submission
	 * @returns {Record<string, DataRecordReference[]>}
	 */
	const mergeAndReferenceEntityData = ({
		originalSubmission,
		submissionData,
		submittedData,
	}: {
		originalSubmission: Submission;
		submissionData: SubmissionData;
		submittedData: SubmittedData[];
	}): Record<string, DataRecordReference[]> => {
		const systemsIdsToRemove = submissionData.deletes
			? Object.values(submissionData.deletes).flatMap((entityData) => entityData.map(({ systemId }) => systemId))
			: [];

		// Exclude items that are marked for deletion
		const submittedDataFiltered =
			systemsIdsToRemove.length > 0
				? submittedData.filter(({ systemId }) => !systemsIdsToRemove.includes(systemId))
				: submittedData;

		const submittedDataWithRef = mapAndMergeSubmittedDataToRecordReferences(
			submittedDataFiltered,
			submissionData.updates,
		);

		const insertDataWithRef = submissionData.inserts
			? mapInsertDataToRecordReferences(originalSubmission.id, submissionData.inserts)
			: {};

		// This object will merge existing data + new data for validation (Submitted data + active Submission)
		return _.mergeWith(submittedDataWithRef, insertDataWithRef, (objValue, srcValue) => {
			if (Array.isArray(objValue)) {
				// If both values are arrays, concatenate them
				return objValue.concat(srcValue);
			}
		});
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

		Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
			const hasErrorByIndex = groupErrorsByIndex(validationErrors);

			schemasDataToValidate.submittedDataByEntityName[entityName].map((data, index) => {
				const oldIsValid = data.isValid;
				const newIsValid = !hasErrorsByIndex(hasErrorByIndex, index);
				if (data.id) {
					const inputUpdate: Partial<SubmittedData> = {};
					if (systemIdsToUpdate.has(data.systemId)) {
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
						dataSubmittedRepo.update(data.id, inputUpdate);
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

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeAndReferenceEntityData({
			originalSubmission,
			submissionData,
			submittedData,
		});

		const currentDictionary = await getActiveDictionaryByCategory(originalSubmission.dictionaryCategoryId);
		if (!currentDictionary) {
			throw new BadRequest(`Dictionary in category '${originalSubmission.dictionaryCategoryId}' not found`);
		}

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
	 * @param {Record<string, SchemaValidationError[]>} input.schemaErrors Array of schemaErrors
	 * @param {string} input.userName User updating the active submission
	 * @returns {Promise<Submission>} An Active Submission updated
	 */
	const updateActiveSubmission = async (input: {
		dictionaryId: number;
		submissionData: SubmissionData;
		idActiveSubmission: number;
		schemaErrors: Record<string, Record<string, SchemaValidationError[]>>;
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
	 * @returns {Promise<Record<string, SubmissionUpdateData>>}
	 */
	const submissionUpdateDataFromFiles = async (
		files: Record<string, Express.Multer.File>,
	): Promise<Record<string, SubmissionUpdateData[]>> => {
		const { getSubmittedDataBySystemId } = submittedRepository(dependencies);
		const results: Record<string, SubmissionUpdateData[]> = {};

		// Process files in parallel using Promise.all
		await Promise.all(
			Object.entries(files).map(async ([entityName, file]) => {
				const parsedFileData = await tsvToJson(file.path);

				// Process records concurrently using Promise.all
				const recordPromises = parsedFileData.map(async (record) => {
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
	 * @param params.submission A `Submission` object representing the Active Submission
	 * @param params.files Uploaded files to be processed
	 * @param params.userName User who performs the action
	 */
	const processEditFilesAsync = async ({
		submission,
		files,
		userName,
	}: {
		submission: Submission;
		files: Record<string, Express.Multer.File>;
		userName: string;
	}): Promise<void> => {
		// Parse file data
		const filesDataProcessed = await submissionUpdateDataFromFiles(files);
		logger.info(
			LOG_MODULE,
			`Read '${Object.values(filesDataProcessed).length}' records in total on files '${Object.keys(files)}'`,
		);

		// Merge Active Submission data with incoming TSV file data processed
		const updatedActiveSubmissionData: Record<string, SubmissionUpdateData[]> = {
			...submission.data.updates,
			...filesDataProcessed,
		};

		// Perform Schema Data validation Async.
		performDataValidation({
			originalSubmission: submission,
			submissionData: {
				inserts: submission.data.inserts,
				deletes: submission.data.deletes,
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
	 * @param {string} params.userName User who performs the action
	 * @returns {void}
	 */
	const validateFilesAsync = async (files: Record<string, Express.Multer.File>, params: ValidateFilesParams) => {
		const { getActiveSubmission } = submissionRepository(dependencies);

		const { categoryId, organization, userName } = params;

		// Parse file data
		const filesDataProcessed = await submissionInsertDataFromFiles(files);

		// Get Active Submission from database
		const activeSubmission = await getActiveSubmission({ categoryId, userName, organization });
		if (!activeSubmission) {
			throw new BadRequest(`Submission '${activeSubmission}' not found`);
		}

		// Merge Active Submission data with incoming TSV file data processed
		const insertActiveSubmissionData: Record<string, SubmissionInsertData> = {
			...activeSubmission.data.inserts,
			...filesDataProcessed,
		};

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
