import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import submittedUtils from '../utils/submittedDataUtils.js';
import { SubmittedDataResponse, paginationOps } from '../utils/types.js';

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
			const { parseSubmittedData } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);
			if (!isValidCategory) {
				return {
					data: [],
					metadata: {
						totalRecords: 0,
						errorMessage: 'Invalid Category ID',
					},
				};
			}

			const recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOps);
			const totalRecords = await getTotalRecordsByCategoryId(categoryId);

			if (!recordsPaginated) {
				return {
					data: [],
					metadata: {
						totalRecords: totalRecords,
						errorMessage: `No Submitted data found on categoryId '${categoryId}'`,
					},
				};
			}

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
		): Promise<{ data: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
			const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
				submittedDataRepo;
			const { categoryIdExists } = categoryRepository(dependencies);
			const { parseSubmittedData } = submittedUtils(dependencies);

			const isValidCategory = await categoryIdExists(categoryId);
			if (!isValidCategory) {
				return {
					data: [],
					metadata: {
						totalRecords: 0,
						errorMessage: 'Invalid Category ID',
					},
				};
			}

			const recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
				categoryId,
				organization,
				paginationOps,
			);
			const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization);

			if (!recordsPaginated) {
				return {
					data: [],
					metadata: {
						totalRecords,
						errorMessage: `No Submitted data found on categoryId '${categoryId}' and organization '${organization}'`,
					},
				};
			}

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
