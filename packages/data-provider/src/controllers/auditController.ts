import { NextFunction, Request, Response } from 'express';

import { BaseDependencies } from '../config/config.js';
import auditSvc from '../services/auditService.js';
import { isAuditEventValid } from '../utils/auditUtils.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { isEmptyString, isValidDateFormat, isValidIdNumber } from '../utils/formatUtils.js';
import { AuditPaginatedResponse } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const auditService = auditSvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'AUDIT_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		byCategoryIdAndOrganization: async (
			req: Request<
				{ categoryId: string; organization: string },
				object,
				object,
				{
					entityName: string;
					eventType: string;
					systemId: string;
					startDate: string;
					endDate: string;
					pageSize: string;
					page: string;
				}
			>,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;

				// pagination parameters
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				// optional query parameters
				const entityName = req.query.entityName;
				const eventType = req.query.eventType;
				const startDate = req.query.startDate;
				const endDate = req.query.endDate;
				const systemId = req.query.systemId;

				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}

				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

				if (eventType && !isAuditEventValid(eventType)) {
					throw new BadRequest('Request provided an invalid Event Type');
				}

				if (page < 0) {
					throw new BadRequest('Invalid `page` parameter');
				}

				if (pageSize < 0) {
					throw new BadRequest('Invalid `pageSize` parameter');
				}

				if (!isEmptyString(startDate) && !isValidDateFormat(startDate)) {
					throw new BadRequest('Invalid `startDate` parameter');
				}

				if (!isEmptyString(endDate) && !isValidDateFormat(endDate)) {
					throw new BadRequest('Invalid `endDate` parameter');
				}

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
		},
	};
};

export default controller;
