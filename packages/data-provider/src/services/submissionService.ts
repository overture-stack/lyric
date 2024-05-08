import { SchemaValidationError, SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import * as _ from 'lodash-es';

import { NewSubmittedData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
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
	SUBMISSION_STATUS,
	SubmissionEntity,
	ValidateFilesParams,
} from '../utils/types.js';

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	const validateFilesAsync = async (files: Record<string, Express.Multer.File>, params: ValidateFilesParams) => {
		const { getActiveSubmission } = submissionRepository(dependencies);
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedRepository(dependencies);
		const {
			createOrUpdateActiveSubmission,
			determineIfIsSubmission,
			extractSchemaDataFromMergedDataRecords,
			submissionEntitiesFromFiles,
			mapSubmissionSchemaDataByEntityName,
		} = submissionUtils(dependencies);
		const { validateSchemas, groupErrorsByIndex, mapSubmittedDataSchemaByEntityName } =
			submittedDataUtils(dependencies);

		const { categoryId, dictionary, organization, userName } = params;

		// get Submitted Data from database
		const submittedData = await getSubmittedDataByCategoryIdAndOrganization(categoryId, organization);

		// parse file data
		const filesDataProcessed = await submissionEntitiesFromFiles(files, params.userName);

		// get Active Submission from database
		const activeSubmission = await getActiveSubmission({ categoryId, userName, organization });

		// merge Active Submission data with incoming TSV file data processed
		const updatedActiveSubmissionData: Record<string, SubmissionEntity> = {
			...activeSubmission?.data,
			...filesDataProcessed,
		};

		// This object will merge existing data + new data for validation (Submitted data + active Submission +  tsv parsed Data)
		const mergeDataRecordsByEntityName = _.mergeWith(
			mapSubmittedDataSchemaByEntityName(submittedData),
			mapSubmissionSchemaDataByEntityName(activeSubmission?.id, updatedActiveSubmissionData),
			(objValue, srcValue) => {
				if (_.isArray(objValue)) {
					// If both values are arrays, concatenate them
					return objValue.concat(srcValue);
				}
			},
		);

		// get schemaData array to validate
		const crossSchemasDataToValidate = extractSchemaDataFromMergedDataRecords(mergeDataRecordsByEntityName);

		// run validation
		const resultValidation = validateSchemas(dictionary, crossSchemasDataToValidate);

		// collect all errors from all schemas
		const submissionSchemaErrors: Record<string, SchemaValidationError[]> = {};

		Object.entries(resultValidation).forEach(([entityName, { validationErrors }]) => {
			const hasErrorByIndex = groupErrorsByIndex(validationErrors, entityName);

			if (!_.isEmpty(hasErrorByIndex)) {
				Object.entries(hasErrorByIndex).map(([indexBasedOnCrossSchemas, schemaValidationErrors]) => {
					const mapping = mergeDataRecordsByEntityName[entityName][Number(indexBasedOnCrossSchemas)];
					if (determineIfIsSubmission(mapping.reference)) {
						const submissionIndex = mapping.reference.index;
						logger.debug(LOG_MODULE, `Error on submission entity: ${entityName} index: ${submissionIndex}`);

						const mutableSchemaValidationErrors: SchemaValidationError[] = schemaValidationErrors.map((errors) => {
							return {
								...errors,
								index: submissionIndex,
							};
						});
						updatedActiveSubmissionData[entityName].dataErrors = mutableSchemaValidationErrors;
						submissionSchemaErrors[entityName] = mutableSchemaValidationErrors;
					}
				});
			}
		});

		if (_.isEmpty(submissionSchemaErrors)) {
			logger.info(LOG_MODULE, `No error found on data submission`);
		}

		// save new or updated Active Submission
		await createOrUpdateActiveSubmission(
			activeSubmission?.id,
			updatedActiveSubmissionData,
			categoryId.toString(),
			submissionSchemaErrors,
			dictionary.id,
			userName,
			organization,
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
					logger.debug(LOG_MODULE, `Updating submittedData '${data.id}' in entity '${entityName}' index '${index}'`);
					dataSubmittedRepo.update(data.id, {
						isValid: data.isValid,
						lastValidSchemaId: data.lastValidSchemaId,
						updatedBy: data.updatedBy,
					});
				} else {
					logger.debug(LOG_MODULE, `Creating new submittedData in entity '${entityName}' index '${index}'`);
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

	return {
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
			const { checkFileNames, checkEntityFieldNames } = submissionUtils(dependencies);
			const { getActiveDictionaryByCategory } = categoryRepository(dependencies);

			const entitiesToProcess: string[] = [];
			const batchErrors: BatchError[] = [];

			if (files.length > 0) {
				const currentDictionary = await getActiveDictionaryByCategory(categoryId);
				if (_.isEmpty(currentDictionary)) throw new BadRequest(`Dictionary in category '${categoryId}' not found`);

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

				if (!_.isEmpty(checkedEntities)) {
					// Running Schema validation in the background do not need to wait
					// Result of validations will be stored in database
					validateFilesAsync(checkedEntities, {
						categoryId,
						dictionary: currentDictionary,
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
			if (_.isEmpty(submission)) return;

			return parseActiveSubmissionSummaryResponse(submission);
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
			if (!submissions || submissions.length === 0) return;

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
			if (_.isEmpty(submission)) return;

			return parseActiveSubmissionResponse(submission);
		},

		commitSubmission: async (categoryId: number, submissionId: number): Promise<CommitSubmissionResult> => {
			const { getSubmissionById } = submissionRepository(dependencies);
			const { getSubmittedDataByCategoryIdAndOrganization } = submittedRepository(dependencies);
			const { getActiveDictionaryByCategory } = categoryRepository(dependencies);

			const submission = await getSubmissionById(submissionId);
			if (_.isEmpty(submission) || !submission.dictionaryId)
				throw new BadRequest(`Submission '${submissionId}' not found`);

			if (submission.dictionaryCategoryId !== categoryId)
				throw new BadRequest(`Category ID provided does not match the category for the Submission`);

			if (submission.status !== SUBMISSION_STATUS.VALID)
				throw new StatusConflict('Submission does not have status VALID and cannot be committed');

			if (!categoryId) throw new BadRequest(`Active Submission does not belong to any Category`);

			const currentDictionary = await getActiveDictionaryByCategory(categoryId);
			if (_.isEmpty(currentDictionary)) throw new BadRequest(`Dictionary in category '${categoryId}' not found`);

			const entitiesToProcess: string[] = [];

			const submittedDataArray = await getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				submission?.organization,
			);

			const submissionsToValidate = Object.entries(submission.data).flatMap(([entityName, submissionEntity]) => {
				entitiesToProcess.push(entityName);
				return submissionEntity.records.map((record) => {
					const newSubmittedData: NewSubmittedData = {
						data: record,
						dictionaryCategoryId: categoryId,
						entityName,
						organization: submission.organization,
						originalSchemaId: submission.dictionaryId,
						lastValidSchemaId: submission.dictionaryId,
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
	};
};

export default service;
