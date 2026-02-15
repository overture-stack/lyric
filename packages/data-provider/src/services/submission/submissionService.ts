import * as _ from 'lodash-es';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import {
	type NewSubmission,
	type SubmissionRecordErrorDetails,
	type SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import systemIdGenerator from '../../external/systemIdGenerator.js';
import createSubmissionRepository from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import createSubmittedDataRepository from '../../repository/submittedRepository.js';
import { getSchemaByName } from '../../utils/dictionaryUtils.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import { filterAndPaginateSubmissionData, type FlattenedSubmissionData } from '../../utils/submissionResponseParser.js';
import {
	checkEntityFieldNames,
	checkFileNames,
	createSubmissionSummaryResponse,
	isSubmissionActive,
	removeItemsFromSubmission,
} from '../../utils/submissionUtils.js';
import {
	CommitSubmissionResult,
	CREATE_SUBMISSION_STATUS,
	type SubmitDataResult,
	type SubmitFileResult,
	type DeleteSubmissionResult,
	type EntityData,
	type PaginationOptions,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	SubmissionSummary,
} from '../../utils/types.js';
import { default as createSubmissionProcessor } from './submissionProcessor.js';

const submissionService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger, onFinishCommit } = dependencies;

	const categoryRepository = createCategoryRepository(dependencies);
	const submissionProcessor = createSubmissionProcessor(dependencies);
	const submissionRepository = createSubmissionRepository(dependencies);
	const submittedDataRepository = createSubmittedDataRepository(dependencies);

	const { generateIdentifier } = systemIdGenerator(dependencies);

	/**
	 * Runs Schema validation asynchronously and moves the Active Submission to Submitted Data
	 * @param {number} categoryId
	 * @param {number} submissionId
	 * @returns {Promise<CommitSubmissionResult>}
	 */
	const commitSubmission = async (
		categoryId: number,
		submissionId: number,
		username: string,
	): Promise<CommitSubmissionResult> => {
		const { getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepository;
		const { getActiveDictionaryByCategory } = categoryRepository;

		const submission = await submissionRepository.getSubmissionDetailsById(submissionId);
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
						originalSchemaId: currentDictionary.id,
						systemId: generateIdentifier(entityName, record),
						createdBy: username,
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
		submissionProcessor.performCommitSubmissionAsync({
			dataToValidate: {
				inserts: insertsToValidate,
				submittedData: submittedDataToValidate,
				deletes: deleteDataArray,
				updates: updateDataArray,
			},
			submissionId: submission.id,
			dictionary: currentDictionary,
			username: username,
			onFinishCommit,
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

		// Validate and update Active Submission after removing the entity
		submissionProcessor.performDataValidation({
			submissionId: submission.id,
			submissionData: updatedActiveSubmissionData,
			username,
		});

		logger.info(LOG_MODULE, `Submission '${submission.id}' updated after removing entity '${filter.entityName}'`);

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
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
	}): Promise<SubmitDataResult> => {
		const entityNames = Object.keys(data);
		logger.info(
			LOG_MODULE,
			`Processing '${entityNames.length}' entities on category id '${categoryId}' organization '${organization}'`,
		);
		if (entityNames.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid data for submission',
			};
		}

		const currentDictionary = await categoryRepository.getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary in category '${categoryId}' not found`,
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
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid entity name '${invalidEntities}' for submission`,
			};
		}

		// Get Active Submission or Open a new one
		const activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });

		// Schema validation runs asynchronously and does not block execution.
		// The results will be saved to the database.
		submissionProcessor.processInsertRecordsAsync({
			records: data,
			submissionId: activeSubmissionId,
			schemasDictionary,
			username,
		});

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
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
	}: {
		files: Express.Multer.File[];
		categoryId: number;
		organization: string;
		username: string;
	}): Promise<SubmitFileResult> => {
		logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);

		if (files.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid files for submission',
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const currentDictionary = await categoryRepository.getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
		// TODO: Use filename map to identify files, concatenate records if multiple files map to same entity
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
		const activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });

		// TODO: Add files to submission, then run validation separately. Currently these processes are both
		//       done by the function that adds the files to the submission.

		// Start background process of adding files to submission
		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		submissionProcessor.addFilesToSubmissionAsync(checkedEntities, {
			schemasDictionary,
			categoryId,
			organization,
			username,
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
		getSubmissionDetailsById,
		getActiveSubmissionByOrganization,
		getOrCreateActiveSubmission,
		submitJson: submit,
		submitFiles,
	};
};

export default submissionService;
