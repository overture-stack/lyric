import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { convertSqonToQuery } from '../utils/buildQuery.js';
import { SQON } from '../utils/sqonTypes.js';
import submittedUtils from '../utils/submittedDataUtils.js';
import { SubmittedDataResponse, paginationOps } from '../utils/types.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const { logger } = dependencies;
	return {
		getSubmittedDataByCategory: async (
			categoryId: number,
			paginationOps: paginationOps,
		): Promise<{
			data: SubmittedDataResponse[];
			metadata: { totalRecords: number; errorMessage?: string };
		}> => {
			const { getSubmittedDataByCategoryIdPaginated, getTotalRecordsByCategoryId } = submittedDataRepo;

			const { categoryIdExists } = categoryRepository(dependencies);
			const { parseSubmittedData, fetchDataErrorResponse } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);
			if (!isValidCategory) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
			}

			const recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOps);
			if (!recordsPaginated) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
			}

			const totalRecords = await getTotalRecordsByCategoryId(categoryId);

			logger.info(LOG_MODULE, `Retrieved '${recordsPaginated?.length}' Submitted data on categoryId '${categoryId}'`);

			return {
				data: parseSubmittedData(recordsPaginated),
				metadata: {
					totalRecords,
				},
			};
		},
		getSubmittedDataByOrganization: async (
			categoryId: number,
			organization: string,
			paginationOps: paginationOps,
			sqon?: SQON,
		): Promise<{ data: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
			const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
				submittedDataRepo;
			const { categoryIdExists } = categoryRepository(dependencies);
			const { parseSubmittedData, fetchDataErrorResponse } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);
			if (!isValidCategory) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
			}

			const filterSql = convertSqonToQuery(sqon);

			const recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
				categoryId,
				organization,
				paginationOps,
				filterSql,
			);
			if (!recordsPaginated) {
				return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
			}

			const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, filterSql);

			logger.info(
				LOG_MODULE,
				`Retrieved '${recordsPaginated?.length}' Submitted data on categoryId '${categoryId}' organization '${organization}'`,
			);

			return {
				data: parseSubmittedData(recordsPaginated),
				metadata: {
					totalRecords,
				},
			};
		},
	};
};

export default service;
