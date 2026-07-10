import { BaseDependencies } from '../config/config.js';
import auditRepository from '../repository/auditRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import { parseAuditRecords } from '../utils/auditUtils.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import type { PaginatedResult } from '../utils/result.js';
import { AuditDataResponse, AuditFilterOptions } from '../utils/types.js';

const auditService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'AUDIT_SERVICE';
	const { logger } = dependencies;
	const categoryRepo = categoryRepository(dependencies);
	const auditRepo = auditRepository(dependencies);
	return {
		byCategoryIdAndOrganization: async (
			categoryId: number,
			filterOptions: AuditFilterOptions,
		): Promise<PaginatedResult<AuditDataResponse>> => {
			logger.debug(LOG_MODULE, `Get category Details`);

			const isValidCategory = await categoryRepo.categoryIdExists(categoryId);

			if (!isValidCategory) {
				throw new BadRequest(`Invalid Category ID`);
			}

			const recordsPaginated = await auditRepo.getRecordsByCategoryIdAndOrganizationPaginated(
				categoryId,
				filterOptions,
			);

			if (recordsPaginated.length === 0) {
				throw new NotFound('No data found');
			}

			const totalRecords = await auditRepo.getTotalRecordsByCategoryIdAndOrganization(categoryId, filterOptions);

			logger.info(LOG_MODULE, `Retrieved '${recordsPaginated.length}' Submitted data on categoryId '${categoryId}'`);

			return {
				result: parseAuditRecords(recordsPaginated),
				metadata: {
					totalRecords,
				},
			};
		},
	};
};

export default auditService;
