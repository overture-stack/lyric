import { type SubmissionDeleteData, SubmittedData } from '@overture-stack/lyric-data-model';
import { SQON } from '@overture-stack/sqon-builder';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import submissionService from '../services/submissionService.js';
import { convertSqonToQuery } from '../utils/convertSqonToQuery.js';
import { getDictionarySchemaRelations, SchemaChildNode } from '../utils/dictionarySchemaRelations.js';
import { BadRequest } from '../utils/errors.js';
import submissionUtils from '../utils/submissionUtils.js';
import {
	fetchDataErrorResponse,
	mapRecordsSubmittedDataResponse,
	transformmSubmittedDataToSubmissionDeleteData,
} from '../utils/submittedDataUtils.js';
import { PaginationOptions, SubmittedDataResponse } from '../utils/types.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const dictionaryRepo = dictionaryRepository(dependencies);
	const { logger } = dependencies;

	/**
	 * This function uses a dictionary children relations to query recursivaly
	 * to return all SubmittedData that relates
	 * @param {Record<string, SchemaChildNode[]>} dictionaryRelations
	 * @param {SubmittedData} submittedData
	 * @returns {Promise<SubmittedData[]>}
	 */
	const searchDirectDependents = async (
		dictionaryRelations: Record<string, SchemaChildNode[]>,
		submittedData: SubmittedData,
	): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		// Check if entity has children relationships
		if (Object.prototype.hasOwnProperty.call(dictionaryRelations, submittedData.entityName)) {
			// Array that represents the children fields to filter
			const filterData: { entityName: string; dataField: string; dataValue: string }[] = Object.values(
				dictionaryRelations[submittedData.entityName],
			)
				.filter((childNode) => childNode.parent?.fieldName)
				.map((childNode) => ({
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: submittedData.data[childNode.parent!.fieldName].toString(),
				}));

			logger.debug(
				LOG_MODULE,
				`Entity '${submittedData.entityName}' has following dependencies filter'${JSON.stringify(filterData)}'`,
			);

			const directDependents = await getSubmittedDataFiltered(submittedData.organization, filterData);

			const additionalDepend = (
				await Promise.all(directDependents.map((record) => searchDirectDependents(dictionaryRelations, record)))
			).flatMap((record) => record);

			const uniqueDependents = [
				...new Map(directDependents.concat(additionalDepend).map((item) => [item.id, item])).values(),
			];

			logger.info(
				LOG_MODULE,
				`Found '${uniqueDependents.length}' records depending on system ID '${submittedData.systemId}'`,
			);

			return uniqueDependents;
		}

		// return empty array when no dependents for this record
		return [];
	};

	return {
		getSubmittedDataByCategory: async (
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
		},

		getSubmittedDataByOrganization: async (
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
		},

		deleteSubmittedDataBySystemId: async (
			systemId: string,
			userName: string,
		): Promise<{ submissionId: string; data: SubmissionDeleteData[] }> => {
			const { getSubmittedDataBySystemId } = submittedDataRepo;
			const { getDictionaryById } = dictionaryRepo;
			const { getOrCreateActiveSubmission, mergeRecords } = submissionUtils(dependencies);
			const { performDataValidation } = submissionService(dependencies);

			// get SubmittedData by SystemId
			const foundRecordToDelete = await getSubmittedDataBySystemId(systemId);

			if (!foundRecordToDelete) {
				throw new BadRequest(`No Submitted data found with systemId '${systemId}'`);
			}

			logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

			// get dictionary
			const dictionary = await getDictionaryById(foundRecordToDelete.lastValidSchemaId);

			if (!dictionary) {
				throw new BadRequest(`Dictionary not found`);
			}

			// get dictionary relations
			const dictionaryRelations = getDictionarySchemaRelations(dictionary);

			const recordDependents = await searchDirectDependents(dictionaryRelations, foundRecordToDelete);

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

			// Validate and update Active Submission
			const updatedRecord = await performDataValidation({
				originalSubmission: activeSubmission,
				submissionData: { inserts: activeSubmission.data.inserts, deletes: mergedSubmissionDeletes },
				userName,
			});

			logger.info(LOG_MODULE, `Added '${submittedDataToDelete.length}' records to be deleted on the Active Submission`);

			return {
				submissionId: updatedRecord.id.toString(),
				data: mapRecordsSubmittedDataResponse(submittedDataToDelete),
			};
		},
	};
};

export default service;
