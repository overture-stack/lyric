import { Dependencies } from '../config/config.js';
import submittedRepository from '../repository/submittedRepository.js';
import submittedUtils from '../utils/submittedDataUtils.js';
import { paginationOps } from '../utils/types.js';

const service = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const { logger } = dependencies;
	return {
		getSubmittedDataByCategory: async (categoryId: number, paginationOps: paginationOps) => {
			const { getSubmittedDataByCategoryIdPaginated } = submittedDataRepo;
			const { parseSubmittedData } = submittedUtils(dependencies);

			const data = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOps);

			logger.debug(LOG_MODULE, `Retrieved '${data?.length}' Submitted data on categoryId '${categoryId}'`);

			if (!data || data.length === 0) return;

			return parseSubmittedData(data);
		},
		getSubmittedDataByOrganization: async (categoryId: number, organization: string, paginationOps: paginationOps) => {
			const { getSubmittedDataByOrganizationPaginated } = submittedDataRepo;
			const { parseSubmittedData } = submittedUtils(dependencies);

			const data = await getSubmittedDataByOrganizationPaginated(categoryId, organization, paginationOps);

			logger.debug(
				LOG_MODULE,
				`Retrieved '${data?.length}' Submitted data on categoryId '${categoryId}' organization '${organization}'`,
			);

			if (!data || data.length === 0) return;

			return parseSubmittedData(data);
		},
	};
};

export default service;
