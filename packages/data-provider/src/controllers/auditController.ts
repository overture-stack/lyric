import { BaseDependencies } from '../config/config.js';
import auditSvc from '../services/auditService.js';
import { NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { auditByCatAndOrgRequestSchema } from '../utils/schemas.js';
import { AuditPaginatedResponse } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const auditService = auditSvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'AUDIT_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		byCategoryIdAndOrganization: validateRequest(auditByCatAndOrgRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;

				// pagination parameters
				const page = parseInt(String(req.query.page)) || defaultPage;
				const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;

				// optional query parameters
				const { entityName, eventType, startDate, endDate, systemId } = req.query;

				logger.info(LOG_MODULE, 'Request Audit', `categoryId '${categoryId}' organization '${organization}'`);

				const auditRecords = await auditService.byCategoryIdAndOrganization(categoryId, organization, {
					entityName,
					eventType,
					startDate,
					endDate,
					systemId,
					page,
					pageSize,
				});

				if (auditRecords.data.length === 0) {
					throw new NotFound('No Records found');
				}

				const responsePaginated: AuditPaginatedResponse = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(auditRecords.metadata.totalRecords / pageSize),
						totalRecords: auditRecords.metadata.totalRecords,
					},
					records: auditRecords.data,
				};
				return res.status(200).send(responsePaginated);
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
