import * as _ from 'lodash-es';

import type { DataRecord, Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { SubmittedData } from '@overture-stack/lyric-data-model';
import { SQON } from '@overture-stack/sqon-builder';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import submissionService from '../services/submissionService.js';
import { convertSqonToQuery } from '../utils/convertSqonToQuery.js';
import { getDictionarySchemaRelations, SchemaChildNode } from '../utils/dictionarySchemaRelations.js';
import {
	checkEntityFieldNames,
	checkFileNames,
	filterUpdatesFromDeletes,
	mergeRecords,
} from '../utils/submissionUtils.js';
import {
	fetchDataErrorResponse,
	mergeSubmittedDataAndDeduplicateById,
	transformmSubmittedDataToSubmissionDeleteData,
} from '../utils/submittedDataUtils.js';
import {
	type BatchError,
	CREATE_SUBMISSION_STATUS,
	type CreateSubmissionStatus,
	PaginationOptions,
	SubmittedDataResponse,
} from '../utils/types.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const { logger } = dependencies;

	const deleteSubmittedDataBySystemId = async (
		categoryId: number,
		systemId: string,
		userName: string,
	): Promise<{
		description: string;
		inProcessEntities: string[];
		status: CreateSubmissionStatus;
		submissionId?: string;
	}> => {
		const { getSubmittedDataBySystemId } = submittedDataRepo;
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { performDataValidation, getOrCreateActiveSubmission } = submissionService(dependencies);

		// get SubmittedData by SystemId
		const foundRecordToDelete = await getSubmittedDataBySystemId(systemId);

		if (!foundRecordToDelete) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `No Submitted data found with systemId '${systemId}'`,
				inProcessEntities: [],
			};
		}
		logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

		if (foundRecordToDelete.dictionaryCategoryId !== categoryId) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid Category ID '${categoryId}' for system ID '${systemId}'`,
				inProcessEntities: [],
			};
		}

		// get current dictionary
		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (!currentDictionary) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary not found`,
				inProcessEntities: [],
			};
		}

		// get dictionary relations
		const dictionaryRelations = getDictionarySchemaRelations(currentDictionary.schemas);

		const recordDependents = await searchDirectDependents({
			data: foundRecordToDelete.data,
			dictionaryRelations,
			entityName: foundRecordToDelete.entityName,
			organization: foundRecordToDelete.organization,
			systemId: foundRecordToDelete.systemId,
		});

		const submittedDataToDelete = [foundRecordToDelete, ...recordDependents];

		const recordsToDeleteMap = transformmSubmittedDataToSubmissionDeleteData(submittedDataToDelete);

		// Get Active Submission or Open a new one
		const activeSubmission = await getOrCreateActiveSubmission({
			categoryId: foundRecordToDelete.dictionaryCategoryId,
			userName,
			organization: foundRecordToDelete.organization,
		});

		// Merge current Active Submission delete entities
		const mergedSubmissionDeletes = mergeRecords(activeSubmission.data.deletes, recordsToDeleteMap);

		const entitiesToProcess = Object.keys(mergedSubmissionDeletes);

		// filter out update records found matching systemID on delete records
		const filteredUpdates = filterUpdatesFromDeletes(activeSubmission.data.updates ?? {}, mergedSubmissionDeletes);

		// Validate and update Active Submission
		performDataValidation({
			originalSubmission: activeSubmission,
			submissionData: {
				inserts: activeSubmission.data.inserts,
				updates: filteredUpdates,
				deletes: mergedSubmissionDeletes,
			},
			userName,
		});

		logger.info(LOG_MODULE, `Added '${entitiesToProcess.length}' records to be deleted on the Active Submission`);

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
			description: 'Submission data is being processed',
			submissionId: activeSubmission.id.toString(),
			inProcessEntities: entitiesToProcess,
		};
	};

	const editSubmittedData = async ({
		categoryId,
		files,
		organization,
		userName,
	}: {
		categoryId: number;
		files: Express.Multer.File[];
		organization: string;
		userName: string;
	}): Promise<{
		batchErrors: BatchError[];
		description?: string;
		inProcessEntities: string[];
		submissionId?: number;
		status: string;
	}> => {
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { processEditFilesAsync, getOrCreateActiveSubmission } = submissionService(dependencies);
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
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary in category '${categoryId}' not found`,
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
		const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);
		const { validFileEntity, batchErrors: fileNamesErrors } = await checkFileNames(files, schemaNames);

		// step 2 Validation. Validate fieldNames (missing required fields based on schema)
		const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);

		const batchErrors = [...fileNamesErrors, ...fieldNameErrors];
		const entitiesToProcess = Object.keys(checkedEntities);

		if (_.isEmpty(checkedEntities)) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid entities in submission',
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		// Get Active Submission or Open a new one
		const activeSubmission = await getOrCreateActiveSubmission({ categoryId, userName, organization });

		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		processEditFilesAsync({
			submission: activeSubmission,
			files: checkedEntities,
			schemasDictionary,
			userName,
		});

		if (batchErrors.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.PROCESSING,
				description: 'Submission files are being processed',
				submissionId: activeSubmission.id,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		return {
			status: CREATE_SUBMISSION_STATUS.PARTIAL_SUBMISSION,
			description: 'Some Submission files are being processed while others were unable to process',
			submissionId: activeSubmission.id,
			batchErrors,
			inProcessEntities: entitiesToProcess,
		};
	};

	const getSubmittedDataByCategory = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
		filterOptions: { entityName?: (string | undefined)[] },
	): Promise<{
		data: SubmittedDataResponse[];
		metadata: { totalRecords: number; errorMessage?: string };
	}> => {
		const { getSubmittedDataByCategoryIdPaginated, getTotalRecordsByCategoryId } = submittedDataRepo;

		const { categoryIdExists } = categoryRepository(dependencies);

		const isValidCategory = await categoryIdExists(categoryId);

		if (!isValidCategory) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOptions, {
			entityNames: filterOptions?.entityName,
		});

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		const totalRecords = await getTotalRecordsByCategoryId(categoryId, { entityNames: filterOptions?.entityName });

		logger.info(LOG_MODULE, `Retrieved '${recordsPaginated.length}' Submitted data on categoryId '${categoryId}'`);

		return {
			data: recordsPaginated,
			metadata: {
				totalRecords,
			},
		};
	};

	const getSubmittedDataByOrganization = async (
		categoryId: number,
		organization: string,
		paginationOptions: PaginationOptions,
		filterOptions?: { sqon?: SQON; entityName?: (string | undefined)[] },
	): Promise<{ data: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
		const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
			submittedDataRepo;
		const { categoryIdExists } = categoryRepository(dependencies);

		const isValidCategory = await categoryIdExists(categoryId);

		if (!isValidCategory) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const sqonQuery = convertSqonToQuery(filterOptions?.sqon);

		const recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
			categoryId,
			organization,
			paginationOptions,
			{ sql: sqonQuery, entityNames: filterOptions?.entityName },
		);

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, {
			sql: sqonQuery,
			entityNames: filterOptions?.entityName,
		});

		logger.info(
			LOG_MODULE,
			`Retrieved '${recordsPaginated.length}' Submitted data on categoryId '${categoryId}' organization '${organization}'`,
		);

		return {
			data: recordsPaginated,
			metadata: {
				totalRecords,
			},
		};
	};

	/**
	 * This function uses a dictionary children relations to query recursivaly
	 * to return all SubmittedData that relates
	 * @param {Record<string, SchemaChildNode[]>} dictionaryRelations
	 * @param {SubmittedData} submittedData
	 * @returns {Promise<SubmittedData[]>}
	 */
	const searchDirectDependents = async ({
		data,
		dictionaryRelations,
		entityName,
		organization,
		systemId,
	}: {
		data: DataRecord;
		dictionaryRelations: Record<string, SchemaChildNode[]>;
		entityName: string;
		organization: string;
		systemId: string;
	}): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		// Check if entity has children relationships
		if (Object.prototype.hasOwnProperty.call(dictionaryRelations, entityName)) {
			// Array that represents the children fields to filter

			const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = Object.values(
				dictionaryRelations[entityName],
			)
				.filter((childNode) => childNode.parent?.fieldName)
				.map((childNode) => ({
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: data[childNode.parent!.fieldName]?.toString(),
				}));

			logger.debug(
				LOG_MODULE,
				`Entity '${entityName}' has following dependencies filter'${JSON.stringify(filterData)}'`,
			);

			const directDependents = await getSubmittedDataFiltered(organization, filterData);

			const additionalDepend = (
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
			).flatMap((item) => item);

			const uniqueDependents = mergeSubmittedDataAndDeduplicateById(directDependents, additionalDepend);

			logger.info(LOG_MODULE, `Found '${uniqueDependents.length}' records depending on system ID '${systemId}'`);

			return uniqueDependents;
		}

		// return empty array when no dependents for this record
		return [];
	};

	return {
		deleteSubmittedDataBySystemId,
		editSubmittedData,
		getSubmittedDataByCategory,
		getSubmittedDataByOrganization,
		searchDirectDependents,
	};
};

export default service;
