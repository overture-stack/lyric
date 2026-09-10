import * as _ from 'lodash-es';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { type NewSubmission } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import createSubmissionRepository from '../../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../../repository/categoryRepository.js';
import createDictionaryRepository from '../../repository/dictionaryRepository.js';
import createSubmissionFilesRepository from '../../repository/submissionFilesRepository.js';
import createSubmissionRecordsRepository, {
	type SubmissionRecordWithEntityName,
} from '../../repository/submissionRecordsRepository.js';
import { getSchemaByName } from '../../utils/dictionaryUtils.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import type { PaginatedResult } from '../../utils/result.js';
import type { FilenameEntityPair } from '../../utils/schemas.js';
import {
	buildDataSummary,
	createSubmissionSummaryResponse,
	type SubmissionSummaryResponse,
} from '../../utils/submissionResponseParser.js';
import type { SubmissionRecordActionType } from '../../utils/submissionTypes.js';
import {
	checkEntityFieldNames,
	type FileParseResult,
	isSubmissionActive,
	resolveFileEntities,
} from '../../utils/submissionUtils.js';
import {
	ACTIVE_SUBMISSION_STATUS,
	CommitSubmissionResult,
	type DeleteSubmissionResult,
	type EntityData,
	type PaginationOptions,
	SUBMISSION_STATUS,
	type SubmitDataResult,
	type SubmitFileResult,
} from '../../utils/types.js';
import type { CommitWorkerInput } from '../../workers/types.js';
import migrationSvc from '../migrationService.js';
import submissionProcessorFactory from './submissionProcessor.js';

const submissionService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	const categoryRepository = createCategoryRepository(dependencies);
	const submissionProcessor = submissionProcessorFactory.create(dependencies);
	const submissionRepository = createSubmissionRepository(dependencies);
	const submissionRecordsRepository = createSubmissionRecordsRepository(dependencies);
	const dictionaryRepository = createDictionaryRepository(dependencies);
	const submissionFilesRepository = createSubmissionFilesRepository(dependencies);

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
		const { getActiveMigrationByCategoryId } = migrationSvc(dependencies);

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

		const activeMigration = await getActiveMigrationByCategoryId(categoryId);
		if (activeMigration) {
			throw new StatusConflict('This submission cannot be committed while a migration is running');
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);
		if (_.isEmpty(currentDictionary)) {
			throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
		}

		await submissionRepository.update(submissionId, { status: SUBMISSION_STATUS.COMMITTING, updatedBy: username });

		// Get entities to process
		const filesOnSubmission = await submissionFilesRepository.getBySubmissionId(submissionId);
		const entitiesToProcess = new Set(filesOnSubmission.map((file) => file.entityName));

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
	 * @param {boolean} force - Flag to force deletion of a submission even if it's not active
	 * @returns {Promise<DeleteSubmissionResult>}
	 */
	const deleteActiveSubmissionById = async (
		submissionId: number,
		username: string,
		force: boolean,
	): Promise<DeleteSubmissionResult> => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!isSubmissionActive(submission.status) && !force) {
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
	 * Removes records or a file from an active submission and starts validation of the updated submission.
	 *
	 * The `filter` determines what is removed:
	 * - `recordId`: removes the specified record.
	 * - `fileId`: removes the specified file and all records associated with it.
	 * - When both IDs are provided, `recordId` takes precedence.
	 * - When neither ID is provided, the operation fails.
	 *
	 * The submission must be active, and the specified record or file must belong to the submission. The updated
	 * submission is validated asynchronously against its schemas and existing submitted data.
	 *
	 * @param submissionId - Submission ID.
	 * @param username - User name performing the action.
	 * @param filter - IDs identifying the record or file to remove.
	 * @returns A result indicating that the updated submission is being processed.
	 */
	const deleteByRecordIdOrFileId = async (
		submissionId: number,
		username: string,
		filter: {
			recordId: number | null;
			fileId: number | null;
		},
	): Promise<SubmitDataResult> => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!isSubmissionActive(submission.status)) {
			throw new StatusConflict('Submission is not active. Only Active Submission can be modified');
		}

		const filesOnSubmission = await submissionFilesRepository.getBySubmissionId(submissionId);

		if (filesOnSubmission.length === 0) {
			throw new BadRequest(`Submission '${submissionId}' has no records or files to delete`);
		}

		// Remove record by ID from the Submission
		if (filter.recordId) {
			const recordFoundInDB = await submissionRecordsRepository.getById(filter.recordId);
			if (!recordFoundInDB) {
				throw new BadRequest(`Record with ID '${filter.recordId}' not found in Submission '${submissionId}'`);
			}

			const fileReference = filesOnSubmission.find((file) => file.id === recordFoundInDB.fileId);
			if (fileReference?.submissionId !== submissionId) {
				throw new BadRequest(`Record with ID '${filter.recordId}' does not belong to Submission '${submissionId}'`);
			}

			await submissionRecordsRepository.deleteByIds([filter.recordId]);
		} else if (filter.fileId != null) {
			const fileId = filter.fileId;
			// Verify the requested FileId belongs to the Submission before deleting
			const fileReference = filesOnSubmission.find((f) => f.id === fileId);
			if (!fileReference) {
				throw new BadRequest(`File with ID '${fileId}' not found in Submission '${submissionId}'`);
			}

			await dependencies.db.transaction(async (tx) => {
				await submissionRecordsRepository.deleteByFileIds([fileId], tx);
				await submissionFilesRepository.deleteById(fileId, tx);
			});
		} else {
			throw new BadRequest('Either recordId or fileId must be provided to delete a record or file from the Submission');
		}

		// Updating the Submission with the new data and 'VALIDATING' status before validation starts
		await submissionRepository.update(submission.id, {
			updatedBy: username,
			status: 'VALIDATING',
		});

		// Perform Schema Data validation in a worker thread
		dependencies.workerPool.dataValidation({ submissionId: submission.id });

		logger.info(
			LOG_MODULE,
			`Submission '${submission.id}' updated after removing entity with recordId '${filter.recordId}' and fileId '${filter.fileId}'`,
		);

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
	): Promise<PaginatedResult<SubmissionSummaryResponse>> => {
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

		const totalSubmissions = await submissionRepository.getTotalSubmissionsByCategory(categoryId, filterOptions);
		const submissionRecordsSummaries = await submissionRecordsRepository.getRecordsSummaryBySubmissionIds(
			recordsPaginated.map((submission) => submission.id),
		);
		const result: SubmissionSummaryResponse[] = recordsPaginated.map((response) => {
			const submissionRecordsSummary = submissionRecordsSummaries[response.id] ?? [];
			const formattedDataSummary = buildDataSummary(submissionRecordsSummary);

			return createSubmissionSummaryResponse({
				...response,
				data: formattedDataSummary,
			});
		});

		return {
			metadata: {
				totalRecords: totalSubmissions,
			},
			result,
		};
	};

	/**
	 * Gets a submission by ID.
	 *
	 * The result includes the submission's general information and a summary of its data and errors.
	 *
	 * @param submissionId - The submission ID.
	 * @returns The submission summary, or `undefined` if the submission does not exist.
	 */
	const getSubmissionById = async (submissionId: number) => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (_.isEmpty(submission)) {
			return;
		}

		const submissionDataSummary = await submissionRecordsRepository.getRecordsSummaryBySubmissionId(submissionId);
		const formattedDataSummary = buildDataSummary(submissionDataSummary);

		return createSubmissionSummaryResponse({
			...submission,
			data: formattedDataSummary,
		});
	};

	/**
	 * Gets submission records using the provided pagination settings and filter options.
	 *
	 * @param submissionId - Submission ID.
	 * @param paginationOptions.page - Page number.
	 * @param paginationOptions.pageSize - Maximum number of records per page.
	 * @param filterOptions.entityNames - Entity names to include.
	 * @param filterOptions.actionTypes - Action types to include.
	 * @param filterOptions.fileId - Optional file ID to include.
	 * @returns The matching submission records, ordered and paginated according to the provided options.
	 * @throws {BadRequest} If the submission does not exist or any requested entity name is invalid.
	 * @throws {InternalServerError} If the dictionary associated with the submission cannot be found.
	 */
	const getSubmissionDetailsById = async ({
		submissionId,
		paginationOptions,
		filterOptions,
	}: {
		submissionId: number;
		paginationOptions: PaginationOptions;
		filterOptions: { entityNames: string[]; actionTypes: SubmissionRecordActionType[]; fileId?: number };
	}): Promise<SubmissionRecordWithEntityName[]> => {
		const submission = await submissionRepository.getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		const dictionary = await dictionaryRepository.getDictionary(
			submission.dictionary.name,
			submission.dictionary.version,
		);

		if (!dictionary) {
			throw new InternalServerError(
				`Dictionary '${submission.dictionary.name}' version '${submission.dictionary.version}' not found`,
			);
		}

		const schemasDictionary: SchemasDictionary = {
			name: dictionary.name,
			version: dictionary.version,
			schemas: dictionary.dictionary,
		};

		const missingEntityNames = filterOptions.entityNames.filter((name) => !getSchemaByName(name, schemasDictionary));

		if (filterOptions.entityNames.length > 0 && missingEntityNames.length > 0) {
			throw new BadRequest(
				`Invalid entity name(s) '${missingEntityNames.join(', ')}' for Submission '${submissionId}'`,
			);
		}

		const submissionRecords = await submissionRecordsRepository.getBySubmissionId(
			submissionId,
			paginationOptions,
			filterOptions,
		);

		return submissionRecords;
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
	}): Promise<SubmissionSummaryResponse | undefined> => {
		const submission = await submissionRepository.getActiveSubmission({
			organization,
			username,
			categoryId,
		});
		if (_.isEmpty(submission)) {
			return;
		}

		const submissionDataSummary = await submissionRecordsRepository.getRecordsSummaryBySubmissionId(submission.id);
		const formattedDataSummary = buildDataSummary(submissionDataSummary);

		return createSubmissionSummaryResponse({
			...submission,
			data: formattedDataSummary,
		});
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

		const activeSubmission = await submissionRepository.getActiveSubmission({
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
			dictionaryCategoryId: categoryId,
			dictionaryId: currentDictionary.id,
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
	 * Validates the uploaded files against the active submission's entity schemas and stores
	 * the parsed records in the database. When `sync` is true, awaits parsing and returns
	 * per-file results; when false (default), parsing runs in the background.
	 */
	const submitFiles = async ({
		files,
		categoryId,
		organization,
		username,
		fileEntityMap,
		sync = false,
	}: {
		files: Express.Multer.File[];
		categoryId: number;
		organization: string;
		username: string;
		fileEntityMap?: FilenameEntityPair[];
		sync?: boolean;
	}): Promise<SubmitFileResult | UnknownCategoryResult> => {
		logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);

		if (files.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid files for submission',
				batchErrors: [],
				fileResults: [],
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
				fileResults: [],
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
					fileResults: [],
					inProcessEntities: [],
				};
			}
			throw error;
		}

		// TODO: Add files to submission, then run validation separately. Currently these processes are both
		//       done by the function that adds the files to the submission.

		// Parsing always starts immediately. When sync=true (default) the response waits for results;
		// when sync=false it runs in the background and fileResults will be empty in the response.
		// Schema validation always runs in a background worker thread regardless of this flag.
		const parsePromise = submissionProcessor.addFilesToSubmissionAsync(checkedEntities, activeSubmissionId, username);
		const fileResults: FileParseResult[] = sync ? await parsePromise : [];

		if (batchErrors.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
				description: 'Submission files are being processed',
				submissionId: activeSubmissionId,
				batchErrors,
				fileResults,
				inProcessEntities: entitiesToProcess,
			};
		}

		return {
			status: ACTIVE_SUBMISSION_STATUS.PARTIAL_SUBMISSION,
			description: 'Some Submission files are being processed while others were unable to process',
			submissionId: activeSubmissionId,
			batchErrors,
			fileResults,
			inProcessEntities: entitiesToProcess,
		};
	};

	return {
		commitSubmission,
		deleteActiveSubmissionById,
		deleteByRecordIdOrFileId,
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
