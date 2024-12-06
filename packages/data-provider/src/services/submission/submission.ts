import * as _ from 'lodash-es';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { type NewSubmission, Submission, type SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import systemIdGenerator from '../../external/systemIdGenerator.js';
import submissionRepository from '../../repository/activeSubmissionRepository.js';
import categoryRepository from '../../repository/categoryRepository.js';
import submittedRepository from '../../repository/submittedRepository.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import {
	canTransitionToClosed,
	checkEntityFieldNames,
	checkFileNames,
	parseSubmissionResponse,
	parseSubmissionSummaryResponse,
	removeItemsFromSubmission,
} from '../../utils/submissionUtils.js';
import {
	CommitSubmissionResult,
	CREATE_SUBMISSION_STATUS,
	type CreateSubmissionResult,
	type PaginationOptions,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	SubmissionSummaryResponse,
} from '../../utils/types.js';
import processor from './processor.js';

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;
	const { performCommitSubmissionAsync, performDataValidation } = processor(dependencies);

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
	 * Get Submissions by Category
	 * @param {number} categoryId - The ID of the category for which data is being fetched.
	 * @param {Object} paginationOptions - Pagination properties
	 * @param {number} paginationOptions.page - Page number
	 * @param {number} paginationOptions.pageSize - Items per page
	 * @param {Object} filterOptions
	 * @param {boolean} filterOptions.onlyActive - Filter by Active status
	 * @param {string} filterOptions.userName - User Name
	 * @returns an array of Submission
	 */

	const getSubmissionsByCategory = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
		filterOptions: {
			onlyActive: boolean;
			userName: string;
		},
	): Promise<{
		result: SubmissionSummaryResponse[];
		metadata: { totalRecords: number; errorMessage?: string };
	}> => {
		const { getSubmissionsWithRelationsByCategory, getTotalSubmissionsByCategory } = submissionRepository(dependencies);

		const recordsPaginated = await getSubmissionsWithRelationsByCategory(categoryId, paginationOptions, filterOptions);
		if (!recordsPaginated || recordsPaginated.length === 0) {
			return {
				result: [],
				metadata: {
					totalRecords: 0,
				},
			};
		}

		const totalRecords = await getTotalSubmissionsByCategory(categoryId, filterOptions);
		return {
			metadata: {
				totalRecords,
			},
			result: recordsPaginated.map((response) => parseSubmissionSummaryResponse(response)),
		};
	};

	/**
	 * Get Submission by Submission ID
	 * @param {number} submissionId A Submission ID
	 * @returns One Submission
	 */
	const getSubmissionById = async (submissionId: number) => {
		const { getSubmissionWithRelationsById } = submissionRepository(dependencies);

		const submission = await getSubmissionWithRelationsById(submissionId);
		if (_.isEmpty(submission)) {
			return;
		}

		return parseSubmissionResponse(submission);
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
	}): Promise<SubmissionSummaryResponse | undefined> => {
		const { getActiveSubmissionWithRelationsByOrganization } = submissionRepository(dependencies);

		const submission = await getActiveSubmissionWithRelationsByOrganization({ organization, userName, categoryId });
		if (_.isEmpty(submission)) {
			return;
		}

		return parseSubmissionSummaryResponse(submission);
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
		const { validateFilesAsync } = processor(dependencies);

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

	return {
		commitSubmission,
		deleteActiveSubmissionById,
		deleteActiveSubmissionEntity,
		getSubmissionsByCategory,
		getSubmissionById,
		getActiveSubmissionByOrganization,
		getOrCreateActiveSubmission,
		uploadSubmission,
	};
};

export default service;
