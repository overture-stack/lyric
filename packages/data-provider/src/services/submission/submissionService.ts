import * as _ from 'lodash-es';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { type NewSubmission, type SubmissionRecordErrorDetails } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import createSubmissionRepository from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import { getSchemaByName } from '../../utils/dictionaryUtils.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import type { FilenameEntityPair } from '../../utils/schemas.js';
import { filterAndPaginateSubmissionData, type FlattenedSubmissionData } from '../../utils/submissionResponseParser.js';
import {
	checkEntityFieldNames,
	createSubmissionSummaryResponse,
	isSubmissionActive,
	removeItemsFromSubmission,
	resolveFileEntities,
} from '../../utils/submissionUtils.js';
import {
	ACTIVE_SUBMISSION_STATUS,
	CommitSubmissionResult,
	type DeleteSubmissionResult,
	type EntityData,
	type PaginationOptions,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	SubmissionSummary,
	type SubmitDataResult,
	type SubmitFileResult,
} from '../../utils/types.js';
import type { CommitWorkerInput } from '../../workers/types.js';
import submissionProcessorFactory from './submissionProcessor.js';

const submissionService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	const categoryRepository = createCategoryRepository(dependencies);
	const submissionProcessor = submissionProcessorFactory.create(dependencies);
	const submissionRepository = createSubmissionRepository(dependencies);

	/**
	 * Runs Schema validation asynchronously in a worker thread and moves the Active Submission to Submitted Data
	 * @param {number} categoryId
	 * @param {number} submissionId
	 * @returns {Promise<CommitSubmissionResult>}
	 */
	const commitSubmission = async (
		categoryId: number,
		submissionId: number,
		username: string,
	): Promise<CommitSubmissionResult> => {
		const { getActiveDictionaryByCategory } = categoryRepository;

		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (submission.dictionaryCategory.id !== categoryId) {
			throw new BadRequest(`Category ID provided does not match the category for the Submission`);
		}

		if (submission.status !== SUBMISSION_STATUS.VALID) {
			throw new StatusConflict('Submission does not have status VALID and cannot be committed');
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);
		if (_.isEmpty(currentDictionary)) {
			throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
		}

		await submissionRepository.update(submissionId, { status: SUBMISSION_STATUS.COMMITTING, updatedBy: username });

		// Get entities to process
		const entitiesToProcess = new Set([
			...Object.keys(submission.data?.inserts ?? {}),
			...Object.keys(submission.data?.updates ?? {}),
			...Object.keys(submission.data?.deletes ?? {}),
		]);

		// Execute commit submission in worker pool
		const commitData: CommitWorkerInput = {
			submissionId,
			username,
		};

		// Let worker thread run async
		dependencies.workerPool.commitSubmission(commitData);

		return {
			status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
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
	 * Returns the resulting ID of the Submission
	 * @param {number} submissionId
	 * @param {string} username
	 * @returns {Promise<DeleteSubmissionResult>}
	 */
	const deleteActiveSubmissionById = async (
		submissionId: number,
		username: string,
	): Promise<DeleteSubmissionResult> => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!isSubmissionActive(submission.status)) {
			throw new StatusConflict('Submission is not active. Only Active Submission can be deleted');
		}

		const updatedRecordId = await submissionRepository.update(submission.id, {
			status: SUBMISSION_STATUS.CLOSED,
			updatedBy: username,
		});

		logger.info(LOG_MODULE, `Submission '${submissionId}' updated with new status '${SUBMISSION_STATUS.CLOSED}'`);

		return {
			status: SUBMISSION_STATUS.CLOSED,
			description: 'Submission closed successfully',
			submissionId: updatedRecordId,
		};
	};

	/**
	 * Function to remove an entity from an Active Submission by given Submission ID
	 * It validates resulting Active Submission running cross schema validation along with the existing Submitted Data
	 * Returns the resulting ID of the Active Submission
	 * @param {number} submissionId
	 * @param {string} entityName
	 * @param {string} username
	 * @returns { Promise<SubmitDataResult>}
	 */
	const deleteActiveSubmissionEntity = async (
		submissionId: number,
		username: string,
		filter: {
			actionType: SubmissionActionType;
			entityName: string;
			index: number | null;
		},
	): Promise<SubmitDataResult> => {
		const submission = await submissionRepository.getSubmissionDetailsById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!isSubmissionActive(submission.status)) {
			throw new StatusConflict('Submission is not active. Only Active Submission can be modified');
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

		// Updating the Submission with the new data and 'VALIDATING' status before validating
		await submissionRepository.update(submission.id, {
			data: updatedActiveSubmissionData,
			updatedBy: username,
			status: 'VALIDATING',
		});

		// Perform Schema Data validation in a worker thread
		dependencies.workerPool.dataValidation({ submissionId: submission.id });

		logger.info(LOG_MODULE, `Submission '${submission.id}' updated after removing entity '${filter.entityName}'`);

		return {
			status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
			description: 'Submission records are being processed',
			submissionId: submission.id,
		};
	};

	/**
	 * Get Submissions by Category
	 * @param {number} categoryId - The ID of the category for which data is being fetched.
	 * @param {Object} paginationOptions - Pagination properties
	 * @param {number} paginationOptions.page - Page number
	 * @param {number} paginationOptions.pageSize - Items per page
	 * @param {Object} filterOptions
	 * @param {boolean} filterOptions.onlyActive - Filter by Active status
	 * @param {string} filterOptions.username - User Name
	 * @returns an array of Submission
	 */

	const getSubmissionsByCategory = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
		filterOptions: {
			onlyActive: boolean;
			username?: string;
			organization?: string;
		},
	): Promise<{
		result: SubmissionSummary[];
		metadata: { totalRecords: number; errorMessage?: string };
	}> => {
		const recordsPaginated = await submissionRepository.getSubmissionsByCategory(
			categoryId,
			paginationOptions,
			filterOptions,
		);
		if (!recordsPaginated || recordsPaginated.length === 0) {
			return {
				result: [],
				metadata: {
					totalRecords: 0,
				},
			};
		}

		const totalRecords = await submissionRepository.getTotalSubmissionsByCategory(categoryId, filterOptions);
		return {
			metadata: {
				totalRecords,
			},
			result: recordsPaginated.map((response) => createSubmissionSummaryResponse(response)),
		};
	};

	/**
	 * Get Submission by Submission ID
	 * @param {number} submissionId A Submission ID
	 * @returns One Submission
	 */
	const getSubmissionById = async (submissionId: number) => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (_.isEmpty(submission)) {
			return;
		}

		return createSubmissionSummaryResponse(submission);
	};

	/**
	 * Get Submission Records paginated
	 * @param {number} submissionId A Submission ID
	 * @param {Object} paginationOptions - Pagination properties
	 * @param {number} paginationOptions.page - Page number
	 * @param {number} paginationOptions.pageSize - Items per page
	 * @param {Object} filterOptions
	 * @param {string} filterOptions.entityName - Filter by Entity name
	 * @param {string} filterOptions.actionType - Filter by Action type
	 * @returns One Submission
	 */
	const getSubmissionDetailsById = async ({
		submissionId,
		paginationOptions,
		filterOptions,
	}: {
		submissionId: number;
		paginationOptions: PaginationOptions;
		filterOptions: { entityNames: string[]; actionTypes: SubmissionActionType[] };
	}): Promise<{ data: FlattenedSubmissionData[]; errors?: SubmissionRecordErrorDetails[] }> => {
		const submission = await submissionRepository.getSubmissionDetailsById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		const submissionEntityNames = [
			...Object.keys(submission.data.inserts ?? {}),
			...Object.keys(submission.data.updates ?? {}),
			...Object.keys(submission.data.deletes ?? {}),
		];

		const missingEntityNames = filterOptions.entityNames.filter((name) => !submissionEntityNames.includes(name));

		if (filterOptions.entityNames.length > 0 && missingEntityNames.length > 0) {
			throw new BadRequest(
				`Invalid entity name(s) '${missingEntityNames.join(', ')}' for Submission '${submissionId}'`,
			);
		}

		return filterAndPaginateSubmissionData({
			data: submission.data,
			errors: submission.errors || {},
			filterOptions,
			paginationOptions,
		});
	};

	/**
	 * Get an active Submission by Organization
	 * @param {Object} params
	 * @param {number} params.categoryId
	 * @param {string} params.username
	 * @param {string} params.organization
	 * @returns One Active Submission
	 */
	const getActiveSubmissionByOrganization = async ({
		categoryId,
		username,
		organization,
	}: {
		categoryId: number;
		username: string;
		organization: string;
	}): Promise<SubmissionSummary | undefined> => {
		const submission = await submissionRepository.getActiveSubmissionSummary({
			organization,
			username,
			categoryId,
		});
		if (_.isEmpty(submission)) {
			return;
		}

		return createSubmissionSummaryResponse(submission);
	};

	/**
	 * Find the current Active Submission or Create an Open Active Submission with initial values and no schema data.
	 * Throws an error if the existing active submission is not in a status that can be modified (OPEN, VALID or INVALID)
	 * @param {object} params
	 * @param {string} params.username Owner of the Submission
	 * @param {number} params.categoryId Category ID of the Submission
	 * @param {string} params.organization Organization name
	 * @returns number ID of the Active Submission
	 */
	const getOrCreateActiveSubmission = async (params: {
		username: string;
		categoryId: number;
		organization: string;
	}): Promise<number> => {
		const { categoryId, username, organization } = params;
		const { getActiveDictionaryByCategory } = categoryRepository;

		const activeSubmission = await submissionRepository.getActiveSubmissionSummary({
			categoryId,
			username,
			organization,
		});

		if (activeSubmission) {
			if (!isSubmissionActive(activeSubmission.status)) {
				throw new StatusConflict(`Existing submission with status '${activeSubmission.status}' cannot be modified`);
			}
			return activeSubmission.id;
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (!currentDictionary) {
			throw new InternalServerError(`Dictionary in category '${categoryId}' not found`);
		}

		const newSubmissionInput: NewSubmission = {
			createdBy: username,
			data: {},
			dictionaryCategoryId: categoryId,
			dictionaryId: currentDictionary.id,
			errors: {},
			organization: organization,
			status: SUBMISSION_STATUS.OPEN,
		};

		return submissionRepository.save(newSubmissionInput);
	};

	type UnknownCategoryResult = { status: 'UNKNOWN_CATEGORY'; description: string };
	/**
	 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
	 * @param {object} params
	 * @param {Record<string, unknown>[]} params.records An array of records
	 * @param {string} params.entityName Entity Name of the Records
	 * @param {number} params.categoryId Category ID of the Submission
	 * @param {string} params.organization Organization name
	 * @param {string} params.username User name creating the Submission
	 * @returns The Active Submission created or Updated
	 */
	const submit = async ({
		data,
		categoryId,
		organization,
		username,
	}: {
		data: EntityData;
		categoryId: number;
		organization: string;
		username: string;
	}): Promise<SubmitDataResult | UnknownCategoryResult> => {
		const entityNames = Object.keys(data);
		logger.info(
			LOG_MODULE,
			`Processing '${entityNames.length}' entities on category id '${categoryId}' organization '${organization}'`,
		);
		if (entityNames.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid data for submission',
			};
		}

		const currentDictionary = await categoryRepository.getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: 'UNKNOWN_CATEGORY',
				description: `Category '${categoryId}' is not available: either this is an invalid ID or the category has no Dictionary registered.`,
			};
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// Validate entity name
		const invalidEntities = entityNames.filter((name) => !getSchemaByName(name, schemasDictionary));
		if (invalidEntities.length) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid entity name '${invalidEntities}' for submission`,
			};
		}

		// Get Active Submission or Open a new one
		let activeSubmissionId: number;
		try {
			activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });
		} catch (error) {
			if (error instanceof StatusConflict || error instanceof InternalServerError) {
				return {
					status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
					description: error.message,
				};
			}
			throw error;
		}

		// Schema validation runs asynchronously and does not block execution.
		// The results will be saved to the database.
		submissionProcessor.processInsertRecordsAsync({
			records: data,
			submissionId: activeSubmissionId,
			schemasDictionary,
			username,
		});

		return {
			status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
			description: 'Submission records are being processed',
			submissionId: activeSubmissionId,
		};
	};

	/**
	 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
	 * @param {object} params
	 * @param {Express.Multer.File[]} params.files An array of files
	 * @param {number} params.categoryId Category ID of the Submission
	 * @param {string} params.organization Organization name
	 * @param {string} params.username User name creating the Submission
	 * @returns The Active Submission created or Updated
	 */
	const submitFiles = async ({
		files,
		categoryId,
		organization,
		username,
		fileEntityMap,
	}: {
		files: Express.Multer.File[];
		categoryId: number;
		organization: string;
		username: string;
		fileEntityMap?: FilenameEntityPair[];
	}): Promise<SubmitFileResult | UnknownCategoryResult> => {
		logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);

		if (files.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid files for submission',
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const currentDictionary = await categoryRepository.getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: 'UNKNOWN_CATEGORY',
				description: `Category '${categoryId}' is not available: either this is an invalid ID or the category has no Dictionary registered.`,
			};
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
		const { validFileEntity, batchErrors: fileNamesErrors } = await resolveFileEntities(
			files,
			schemasDictionary.schemas,
			fileEntityMap,
		);

		if (_.isEmpty(validFileEntity)) {
			logger.debug(LOG_MODULE, `No valid files for submission`);
		}

		// step 2 Validation. Validate fieldNames (missing required fields based on schema)
		const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(validFileEntity);

		const batchErrors = [...fileNamesErrors, ...fieldNameErrors];
		const entitiesToProcess = Object.keys(checkedEntities);

		if (_.isEmpty(checkedEntities)) {
			logger.info(LOG_MODULE, 'Found errors on Submission files.', JSON.stringify(batchErrors));
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid entities in submission',
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		// Get Active Submission or Open a new one
		let activeSubmissionId: number;
		try {
			activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });
		} catch (error) {
			if (error instanceof StatusConflict || error instanceof InternalServerError) {
				return {
					status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
					description: error.message,
					batchErrors: [],
					inProcessEntities: [],
				};
			}
			throw error;
		}

		// TODO: Add files to submission, then run validation separately. Currently these processes are both
		//       done by the function that adds the files to the submission.

		// Start background process of adding files to submission
		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		submissionProcessor.addFilesToSubmissionAsync(checkedEntities, {
			categoryId,
			organization,
			username,
		});

		if (batchErrors.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
				description: 'Submission files are being processed',
				submissionId: activeSubmissionId,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		return {
			status: ACTIVE_SUBMISSION_STATUS.PARTIAL_SUBMISSION,
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
		getSubmissionDetailsById,
		getActiveSubmissionByOrganization,
		getOrCreateActiveSubmission,
		submit,
		submitFiles,
	};
};

export default submissionService;
