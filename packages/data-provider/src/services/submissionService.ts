import {
	BatchProcessingResult,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import * as _ from 'lodash-es';

import { NewSubmittedData, Submission, SubmissionData, SubmittedData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import systemIdGenerator from '../external/systemIdGenerator.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { BadRequest, StatusConflict } from '../utils/errors.js';
import submissionUtils from '../utils/submissionUtils.js';
import submittedDataUtils from '../utils/submittedDataUtils.js';
import {
	ActiveSubmissionSummaryResponse,
	BatchError,
	CREATE_SUBMISSION_STATUS,
	CommitSubmissionParams,
	CommitSubmissionResult,
	CreateSubmissionResult,
	CreateSubmissionStatus,
	DataRecordReference,
	SUBMISSION_STATUS,
	ValidateFilesParams,
} from '../utils/types.js';

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	/**
	 * Returns only the schema errors corresponding to the Active Submission.
	 * Schema errors are grouped by Entity name.
	 * @param {object} input
	 * @param {Record<string, BatchProcessingResult>} input.resultValidation
	 * @param {Record<string, DataRecordReference[]>} input.dataValidated
	 * @returns {Record<string, SchemaValidationError[]>}
	 */
	const groupSchemaErrorsByEntity = (input: {
		resultValidation: Record<string, BatchProcessingResult>;
		dataValidated: Record<string, DataRecordReference[]>;
	}): Record<string, SchemaValidationError[]> => {
		const { resultValidation, dataValidated } = input;

		const { groupErrorsByIndex } = submittedDataUtils(dependencies);
		const { determineIfIsSubmission } = submissionUtils(dependencies);

		const submissionSchemaErrors: Record<string, SchemaValidationError[]> = {};
		Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
			const hasErrorByIndex = groupErrorsByIndex(validationErrors, entityName);

			if (!_.isEmpty(hasErrorByIndex)) {
				Object.entries(hasErrorByIndex).map(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
					const mapping = dataValidated[entityName][Number(indexBasedOnCrossSchemas)];
					if (determineIfIsSubmission(mapping.reference)) {
						const submissionIndex = mapping.reference.index;
						logger.debug(LOG_MODULE, `Error on submission entity: ${entityName} index: ${submissionIndex}`);

						const mutableSchemaValidationErrors: SchemaValidationError[] = schemaValidationErrors.map((errors) => {
							return {
								...errors,
								index: submissionIndex,
							};
						});

						submissionSchemaErrors[entityName] = (submissionSchemaErrors[entityName] || []).concat(
							mutableSchemaValidationErrors,
						);
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
	 * @param {Record<string, SubmissionData>} activeSubmission.data Collection of Data records of the Active Submission
	 * @param {number} activeSubmission.id ID of the Active Submission
	 * @returns {Record<string, DataRecordReference[]>}
	 */
	const mergeActiveSubmissionAndSubmittedData = (
		submittedData: SubmittedData[],
		activeSubmission: { data: Record<string, SubmissionData>; id: number },
	): Record<string, DataRecordReference[]> => {
		const { mapSubmissionSchemaDataByEntityName } = submissionUtils(dependencies);
		const { mapSubmittedDataSchemaByEntityName } = submittedDataUtils(dependencies);

		// This object will merge existing data + new data for validation (Submitted data + active Submission)
		return _.mergeWith(
			mapSubmittedDataSchemaByEntityName(submittedData),
			mapSubmissionSchemaDataByEntityName(activeSubmission.id, activeSubmission.data),
			(objValue, srcValue) => {
				if (Array.isArray(objValue)) {
					// If both values are arrays, concatenate them
					return objValue.concat(srcValue);
				}
			},
		);
	};

	/**
	 * This function validates whole data together against a dictionary
	 * @param {object} params
	 * @param {Array<NewSubmittedData>} data Data to be validated
	 * @param {SchemasDictionary & { id: number }} dictionary Dictionary to validata data
	 * @param {Submission} submission Active Submission object
	 * @returns void
	 */
	const performCommitSubmissionAsync = async (params: CommitSubmissionParams): Promise<void> => {
		const submissionRepo = submissionRepository(dependencies);
		const dataSubmittedRepo = submittedRepository(dependencies);
		const { groupSchemaDataByEntityName, validateSchemas, groupErrorsByIndex, hasErrorsByIndex } =
			submittedDataUtils(dependencies);

		const { dictionary, data, submission } = params;

		const schemasDataToValidate = groupSchemaDataByEntityName(data);

		const resultValidation = validateSchemas(dictionary, schemasDataToValidate.schemaDataByEntityName);

		Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
			const hasErrorByIndex = groupErrorsByIndex(validationErrors, entityName);

			schemasDataToValidate.submittedDataByEntityName[entityName].map((data, index) => {
				data.isValid = !hasErrorsByIndex(hasErrorByIndex, index);
				if (data.id) {
					if (data.isValid) {
						logger.debug(LOG_MODULE, `Updating submittedData system ID '${data.systemId}' in entity '${entityName}'`);
						dataSubmittedRepo.update(data.id, {
							isValid: data.isValid,
							lastValidSchemaId: data.lastValidSchemaId,
							updatedBy: data.updatedBy,
						});
					} else {
						logger.error(
							LOG_MODULE,
							`Updating submittedData system ID '${data.systemId}' as Invalid in entity '${entityName}'`,
						);
						dataSubmittedRepo.update(data.id, {
							isValid: data.isValid,
							updatedBy: data.updatedBy,
						});
					}
				} else {
					logger.info(
						LOG_MODULE,
						`Creating new submittedData in entity '${entityName}' with system ID '${data.systemId}'`,
					);
					dataSubmittedRepo.save(data);
				}
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
	 * @param {Record<string, SubmissionData>} input.newSubmissionData New Schema data
	 * @param {string} input.username User who performs the action
	 * @returns {Promise<Submission>}
	 */
	const performDataValidation = async (input: {
		originalSubmission: Submission;
		newSubmissionData: Record<string, SubmissionData>;
		userName: string;
	}): Promise<Submission> => {
		const { originalSubmission, newSubmissionData, userName } = input;

		const { extractSchemaDataFromMergedDataRecords, updateActiveSubmission } = submissionUtils(dependencies);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { validateSchemas } = submittedDataUtils(dependencies);
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedRepository(dependencies);

		// Get Submitted Data from database
		const submittedData = await getSubmittedDataByCategoryIdAndOrganization(
			originalSubmission.dictionaryCategoryId,
			originalSubmission.organization,
		);

		// Merge Submitted Data with Active Submission keepping reference of each record ID
		const dataMergedByEntityName = mergeActiveSubmissionAndSubmittedData(submittedData, {
			data: newSubmissionData,
			id: originalSubmission.id,
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
			entityMap: newSubmissionData,
			categoryId: originalSubmission.dictionaryCategoryId.toString(),
			schemaErrors: submissionSchemaErrors,
			dictionaryId: currentDictionary.id,
			userName: userName,
			organization: originalSubmission.organization,
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
		const { submissionEntitiesFromFiles } = submissionUtils(dependencies);

		const { categoryId, organization, userName } = params;

		// Parse file data
		const filesDataProcessed = await submissionEntitiesFromFiles(files, userName);

		// Get Active Submission from database
		const activeSubmission = await getActiveSubmission({ categoryId, userName, organization });
		if (!activeSubmission) {
			throw new BadRequest(`Submission '${activeSubmission}' not found`);
		}

		// Merge Active Submission data with incoming TSV file data processed
		const updatedActiveSubmissionData: Record<string, SubmissionData> = {
			...activeSubmission.data,
			...filesDataProcessed,
		};

		// Perform Schema Data validation Async.
		performDataValidation({
			originalSubmission: activeSubmission,
			newSubmissionData: updatedActiveSubmissionData,
			userName,
		});
	};

	return {
		/**
		 * Runs Schema validation asynchronously and moves the Active Submission to Submitted Data
		 * @param {number} categoryId
		 * @param {number} submissionId
		 * @returns {Promise<CommitSubmissionResult>}
		 */
		commitSubmission: async (categoryId: number, submissionId: number): Promise<CommitSubmissionResult> => {
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

			if (!categoryId) {
				throw new BadRequest(`Active Submission does not belong to any Category`);
			}

			const currentDictionary = await getActiveDictionaryByCategory(categoryId);
			if (_.isEmpty(currentDictionary)) {
				throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
			}

			const entitiesToProcess: string[] = [];

			const submittedDataArray = await getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				submission?.organization,
			);

			const submissionsToValidate = Object.entries(submission.data).flatMap(([entityName, submissionData]) => {
				entitiesToProcess.push(entityName);
				return submissionData.records.map((record) => {
					const newSubmittedData: NewSubmittedData = {
						data: record,
						dictionaryCategoryId: categoryId,
						entityName,
						isValid: false, // default as false
						organization: submission.organization,
						originalSchemaId: submission.dictionaryId,
						lastValidSchemaId: submission.dictionaryId,
						systemId: generateIdentifier(entityName, record),
						createdBy: '', // TODO: get User from auth
					};
					return newSubmittedData;
				});
			}, {});

			if (Array.isArray(submittedDataArray) && submittedDataArray.length > 0) {
				logger.info(LOG_MODULE, `Found submitted data to be revalidated`);
				submittedDataArray.forEach((data) => {
					submissionsToValidate.push(data);
					if (!_.includes(entitiesToProcess, data.entityName)) {
						entitiesToProcess.push(data.entityName);
					}
				});
			}

			// To Commit Active Submission we need to validate SubmittedData + Active Submission
			performCommitSubmissionAsync({
				data: submissionsToValidate,
				submission,
				dictionary: currentDictionary,
			});

			return {
				status: CREATE_SUBMISSION_STATUS.PROCESSING,
				dictionary: {
					name: currentDictionary.name,
					version: currentDictionary.version,
				},
				processedEntities: entitiesToProcess,
			};
		},

		/**
		 * Updates Submission status to CLOSED
		 * This action is allowed only if current Submission Status as OPEN, VALID or INVALID
		 * Returns the resulting Active Submission with its status
		 * @param {number} submissionId
		 * @param {string} userName
		 * @returns {Promise<Submission | undefined>}
		 */
		deleteActiveSubmissionById: async (submissionId: number, userName: string): Promise<Submission | undefined> => {
			const { getSubmissionById, update } = submissionRepository(dependencies);
			const { canTransitionToClosed } = submissionUtils(dependencies);

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
		},

		/**
		 * Function to remove an entity from an Active Submission by given Submission ID
		 * It validates resulting Active Submission running cross schema validation along with the existing Submitted Data
		 * Returns the resulting Active Submission with its status
		 * @param {number} submissionId
		 * @param {string} entityName
		 * @param {string} userName
		 * @returns { Promise<Submission | undefined>} Resulting Active Submittion
		 */
		deleteActiveSubmissionEntity: async (
			submissionId: number,
			entityName: string,
			userName: string,
		): Promise<Submission | undefined> => {
			const { getSubmissionById } = submissionRepository(dependencies);
			const { removeEntityFromSubmission } = submissionUtils(dependencies);

			const submission = await getSubmissionById(submissionId);
			if (!submission) {
				throw new BadRequest(`Submission '${submissionId}' not found`);
			}

			if (!_.has(submission.data, entityName)) {
				throw new BadRequest(`Entity '${entityName}' not found on Submission`);
			}

			// Remove entity from the Submission
			const updatedActiveSubmissionData = removeEntityFromSubmission(submission.data, entityName);

			const updatedRecord = await performDataValidation({
				originalSubmission: submission,
				newSubmissionData: updatedActiveSubmissionData,
				userName,
			});

			logger.info(LOG_MODULE, `Submission '${updatedRecord.id}' updated with new status '${updatedRecord.status}'`);

			return updatedRecord;
		},

		/**
		 * Get an active Submission by Category
		 * @param {Object} params
		 * @param {number} params.categoryId
		 * @param {string} params.userName
		 * @returns  One Active Submission
		 */
		getActiveSubmissionsByCategory: async ({
			categoryId,
			userName,
		}: {
			categoryId: number;
			userName: string;
		}): Promise<ActiveSubmissionSummaryResponse[] | undefined> => {
			const { getActiveSubmissionsWithRelationsByCategory } = submissionRepository(dependencies);
			const { parseActiveSubmissionSummaryResponse } = submissionUtils(dependencies);

			const submissions = await getActiveSubmissionsWithRelationsByCategory({ userName, categoryId });
			if (!submissions || submissions.length === 0) {
				return;
			}

			return submissions.map((response) => parseActiveSubmissionSummaryResponse(response));
		},

		/**
		 * Get Active Submission by Submission ID
		 * @param {number} submissionId A Submission ID
		 * @returns One Active Submission
		 */
		getActiveSubmissionById: async (submissionId: number) => {
			const { getActiveSubmissionWithRelationsById } = submissionRepository(dependencies);
			const { parseActiveSubmissionResponse } = submissionUtils(dependencies);

			const submission = await getActiveSubmissionWithRelationsById(submissionId);
			if (_.isEmpty(submission)) {
				return;
			}

			return parseActiveSubmissionResponse(submission);
		},

		/**
		 * Get an active Submission by Organization
		 * @param {Object} params
		 * @param {number} params.categoryId
		 * @param {string} params.userName
		 * @param {string} params.organization
		 * @returns One Active Submission
		 */
		getActiveSubmissionByOrganization: async ({
			categoryId,
			userName,
			organization,
		}: {
			categoryId: number;
			userName: string;
			organization: string;
		}): Promise<ActiveSubmissionSummaryResponse | undefined> => {
			const { getActiveSubmissionWithRelationsByOrganization } = submissionRepository(dependencies);
			const { parseActiveSubmissionSummaryResponse } = submissionUtils(dependencies);

			const submission = await getActiveSubmissionWithRelationsByOrganization({ organization, userName, categoryId });
			if (_.isEmpty(submission)) {
				return;
			}

			return parseActiveSubmissionSummaryResponse(submission);
		},

		/**
		 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
		 * @param {Express.Multer.File[]} files An array of files
		 * @param {number} categoryId Category ID of the Submission
		 * @param {string} organization Organization name
		 * @param {string} userName User name creating the Submission
		 * @returns The Active Submission created or Updated
		 */
		uploadSubmission: async ({
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
			const { checkFileNames, checkEntityFieldNames, createOpenActiveSubmission } = submissionUtils(dependencies);
			const { getActiveDictionaryByCategory } = categoryRepository(dependencies);

			const entitiesToProcess: string[] = [];
			const batchErrors: BatchError[] = [];

			if (files.length > 0) {
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
				batchErrors.push(...fileNamesErrors);

				// step 2 Validation. Validate fieldNames (missing required fields based on schema)
				const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);
				batchErrors.push(...fieldNameErrors);
				entitiesToProcess.push(...Object.keys(checkedEntities));

				// create Open Active Submission
				await createOpenActiveSubmission({
					categoryId,
					createdBy: userName,
					dictionaryId: currentDictionary.id,
					organization,
				});

				if (!_.isEmpty(checkedEntities)) {
					// Running Schema validation in the background do not need to wait
					// Result of validations will be stored in database
					validateFilesAsync(checkedEntities, {
						categoryId,
						organization,
						userName,
					});
				}
			}

			let status: CreateSubmissionStatus = CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION;
			let description: string = 'No valid files for submission';
			if (batchErrors.length === 0 && entitiesToProcess.length > 0) {
				status = CREATE_SUBMISSION_STATUS.PROCESSING;
				description = 'Submission files are being processed';
			} else if (batchErrors.length > 0 && entitiesToProcess.length > 0) {
				status = CREATE_SUBMISSION_STATUS.PARTIAL_SUBMISSION;
				description = 'Some Submission files are being processed while others were unable to process';
			}

			return {
				status,
				description,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		},
	};
};

export default service;
