import * as _ from 'lodash-es';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import {
	type NewSubmission,
	type SubmissionRecordErrorDetails,
	type SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../../config/config.js';
import systemIdGenerator from '../../external/systemIdGenerator.js';
import submissionRepository from '../../repository/activeSubmissionRepository.js';
import categoryRepository from '../../repository/categoryRepository.js';
import submittedRepository from '../../repository/submittedRepository.js';
import { getSchemaByName } from '../../utils/dictionaryUtils.js';
import { BadRequest, InternalServerError, StatusConflict } from '../../utils/errors.js';
import { filterAndPaginateSubmissionData, type FlattenedSubmissionData } from '../../utils/submissionResponseParser.js';
import {
	createSubmissionSummaryResponse,
	isSubmissionActive,
	removeItemsFromSubmission,
} from '../../utils/submissionUtils.js';
import { computeDataDiff } from '../../utils/submittedDataUtils.js';
import {
	CommitSubmissionResult,
	CREATE_SUBMISSION_STATUS,
	type CreateSubmissionResult,
	type DeleteSubmissionResult,
	type EntityData,
	type PaginationOptions,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	SubmissionSummary,
	type SubmittedDataResponse,
} from '../../utils/types.js';
import processor from './processor.js';

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger, onFinishCommit } = dependencies;
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
		username: string,
	): Promise<CommitSubmissionResult> => {
		const submissionRepo = submissionRepository(dependencies);
		const dataSubmittedRepo = submittedRepository(dependencies);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { generateIdentifier } = systemIdGenerator(dependencies);

		const submission = await submissionRepo.getSubmissionDetailsById(submissionId);
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

		const { result: openSubmissions } = await getSubmissionsByCategory(
			categoryId,
			{ pageSize: 2, page: 1 },
			{ onlyActive: true, organization: submission.organization },
		);

		const isSameDictionaryVersion =
			submission.dictionary.name === currentDictionary.name &&
			submission.dictionary.version === currentDictionary.version;

		const entitiesToProcess = new Set<string>();

		// Records must be validated when:
		// - There's another submission open in the same category and organization.
		// - OR, the submission to commit was created using a different dictionary version.
		const requiresValidation = openSubmissions.length > 1 || !isSameDictionaryVersion;

		if (requiresValidation) {
			const submittedDataToValidate = await dataSubmittedRepo.getSubmittedDataByCategoryIdAndOrganization(
				categoryId,
				submission?.organization,
			);

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
			performCommitSubmissionAsync({
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
		} else {
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
				// Process submission insert records
				for (const [entityName, submissionData] of Object.entries(submission.data.inserts ?? {})) {
					entitiesToProcess.add(entityName);

					for (const record of submissionData.records) {
						const systemId = generateIdentifier(entityName, record);

						const newData = {
							data: record,
							dictionaryCategoryId: categoryId,
							entityName,
							isValid: true,
							organization: submission.organization,
							originalSchemaId: currentDictionary.id,
							systemId,
							createdBy: username,
						};

						await dataSubmittedRepo.save(newData, tx);

						resultCommit.inserts.push({
							isValid: true,
							entityName,
							organization: submission.organization,
							data: record,
							systemId,
						});
					}
				}

				// Process submission update records
				for (const [entityName, submissionData] of Object.entries(submission.data.updates ?? {})) {
					for (const record of submissionData) {
						const oldRecord = await dataSubmittedRepo.getSubmittedDataBySystemId(record.systemId);

						if (!oldRecord) {
							continue;
						}

						await dataSubmittedRepo.update(
							{
								submittedDataId: oldRecord.id,
								newData: record.new,
								dataDiff: { old: record.old, new: record.new },
								oldIsValid: oldRecord.isValid,
								submissionId: submission.id,
							},
							tx,
						);

						resultCommit.updates.push({
							isValid: true,
							entityName,
							organization: submission.organization,
							data: record,
							systemId: record.systemId,
						});
					}
				}

				// Process submission delete records
				for (const [entityName, submissionData] of Object.entries(submission.data.deletes ?? {})) {
					for (const record of submissionData) {
						await dataSubmittedRepo.deleteBySystemId(
							{
								submissionId: submission.id,
								systemId: record.systemId,
								diff: computeDataDiff(record.data, null),
								username,
							},
							tx,
						);

						resultCommit.deletes.push({
							isValid: true,
							entityName,
							organization: submission.organization,
							data: record.data,
							systemId: record.systemId,
						});
					}
				}

				await submissionRepo.update(submission.id, {
					status: SUBMISSION_STATUS.COMMITTED,
					updatedAt: new Date(),
				});
			});

			onFinishCommit?.({
				submissionId: submission.id,
				organization: submission.organization,
				categoryId: submission.dictionaryCategory.id,
				data: resultCommit,
			});
		}

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
		const { getSubmissionById, update } = submissionRepository(dependencies);

		const submission = await getSubmissionById(submissionId);
		if (!submission) {
			throw new BadRequest(`Submission '${submissionId}' not found`);
		}

		if (!isSubmissionActive(submission.status)) {
			throw new StatusConflict('Submission is not active. Only Active Submission can be deleted');
		}

		const updatedRecordId = await update(submission.id, {
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
	 * @returns { Promise<CreateSubmissionResult>}
	 */
	const deleteActiveSubmissionEntity = async (
		submissionId: number,
		username: string,
		filter: {
			actionType: SubmissionActionType;
			entityName: string;
			index: number | null;
		},
	): Promise<CreateSubmissionResult> => {
		const { getSubmissionDetailsById } = submissionRepository(dependencies);

		const submission = await getSubmissionDetailsById(submissionId);
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
		performDataValidation({
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
		const { getSubmissionsByCategory, getTotalSubmissionsByCategory } = submissionRepository(dependencies);

		const recordsPaginated = await getSubmissionsByCategory(categoryId, paginationOptions, filterOptions);
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
			result: recordsPaginated.map((response) => createSubmissionSummaryResponse(response)),
		};
	};

	/**
	 * Get Submission by Submission ID
	 * @param {number} submissionId A Submission ID
	 * @returns One Submission
	 */
	const getSubmissionById = async (submissionId: number) => {
		const { getSubmissionById } = submissionRepository(dependencies);

		const submission = await getSubmissionById(submissionId);
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
		const { getSubmissionDetailsById } = submissionRepository(dependencies);

		const submission = await getSubmissionDetailsById(submissionId);
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
		const { getActiveSubmission } = submissionRepository(dependencies);

		const submission = await getActiveSubmission({
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
		const submissionRepo = submissionRepository(dependencies);
		const categoryRepo = categoryRepository(dependencies);

		const activeSubmission = await submissionRepo.getActiveSubmission({ categoryId, username, organization });
		if (activeSubmission) {
			return activeSubmission.id;
		}

		const currentDictionary = await categoryRepo.getActiveDictionaryByCategory(categoryId);

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

		return submissionRepo.save(newSubmissionInput);
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
	}): Promise<CreateSubmissionResult> => {
		const entityNames = Object.keys(data);
		logger.info(
			LOG_MODULE,
			`Processing '${entityNames.length}' entities on category id '${categoryId}' organization '${organization}'`,
		);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { processInsertRecordsAsync } = processor(dependencies);

		if (entityNames.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid data for submission',
			};
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

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
		processInsertRecordsAsync({
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
	};
};

export default service;
