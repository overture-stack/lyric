import { SQON } from '@overture-stack/sqon-builder';
import { SubmittedData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { convertSqonToQuery } from '../utils/convertSqonToQuery.js';
import { SchemaNode, getDictionarySchemaRelations } from '../utils/dictionarySchemaRelations.js';
import { BadRequest } from '../utils/errors.js';
import submittedUtils from '../utils/submittedDataUtils.js';
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
	 * @param {Record<string, SchemaNode[]>} dictionaryRelations
	 * @param {SubmittedData} submittedData
	 * @returns {Promise<SubmittedData[]>}
	 */
	const searchDirectDependents = async (
		dictionaryRelations: Record<string, SchemaNode[]>,
		submittedData: SubmittedData,
	): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		// Check if entity has children relationships
		if (dictionaryRelations.hasOwnProperty(submittedData.entityName)) {
			// Array that represents the children fields to filter
			const filterData: { entityName: string; dataField: string; dataValue: string }[] = Object.values(
				dictionaryRelations[submittedData.entityName],
			)
				.filter((childrenNode) => childrenNode.parent?.fieldName)
				.map((childrenNode) => ({
					entityName: childrenNode.schemaName,
					dataField: childrenNode.fieldName,
					dataValue: submittedData.data[childrenNode.parent!.fieldName].toString(),
				}));

			logger.info(
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
		): Promise<{
			data: SubmittedDataResponse[];
			metadata: { totalRecords: number; errorMessage?: string };
		}> => {
			const { getSubmittedDataByCategoryIdPaginated, getTotalRecordsByCategoryId } = submittedDataRepo;

			const { categoryIdExists } = categoryRepository(dependencies);
			const { fetchDataErrorResponse } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);

			if (!isValidCategory) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
			}

			const recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOptions);

			if (recordsPaginated.length === 0) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
			}

			const totalRecords = await getTotalRecordsByCategoryId(categoryId);

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
			sqon?: SQON,
		): Promise<{ data: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
			const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
				submittedDataRepo;
			const { categoryIdExists } = categoryRepository(dependencies);
			const { fetchDataErrorResponse } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);

			if (!isValidCategory) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
			}

			const filterSql = convertSqonToQuery(sqon);

			const recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
				categoryId,
				organization,
				paginationOptions,
				filterSql,
			);

			if (recordsPaginated.length === 0) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
			}

			const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, filterSql);

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
			dryRun: boolean,
			reason: string,
			userName: string,
		): Promise<SubmittedDataResponse[]> => {
			const { getSubmittedDataBySystemId } = submittedDataRepo;
			const { getDictionaryById } = dictionaryRepo;
			const { mapRecordsSubmittedDataResponse } = submittedUtils(dependencies);

			// get SubmittedData by SystemId
			const submittedData = await getSubmittedDataBySystemId(systemId);

			if (!submittedData) {
				throw new BadRequest(`No Submitted data found with systemId '${systemId}'`);
			}

			logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

			// create array with records to be updated
			const recordsToUpdate: SubmittedData[] = [submittedData];

			// get dictionary
			const dictionary = await getDictionaryById(submittedData.lastValidSchemaId);

			if (!dictionary) {
				throw new BadRequest(`Dictionary not found`);
			}

			// get dictionary relations
			const dictionaryRelations = getDictionarySchemaRelations(dictionary);

			const recordDependency = await searchDirectDependents(dictionaryRelations, submittedData);

			if (recordDependency && recordDependency.length > 0) {
				recordsToUpdate.push(...recordDependency);
			}

			if (dryRun === false) {
				// Execute soft deletion on Submitted Data
				const submittedDataIds = recordsToUpdate.map((records) => records.id);
				const updatedRecords = await submittedDataRepo.updateMany(submittedDataIds, {
					comment: `Soft-Delete reason: ${reason}`,
					deletedAt: new Date(),
					deletedBy: userName,
				});

				logger.info(LOG_MODULE, `Successfully soft deleted Submitted Data. Total records '${updatedRecords.length}'`);

				return mapRecordsSubmittedDataResponse(updatedRecords);
			}

			logger.info(LOG_MODULE, `Dry-Run Delete Submitted Data. Total records '${recordsToUpdate.length}'`);

			return mapRecordsSubmittedDataResponse(recordsToUpdate);
		},
	};
};

export default service;
