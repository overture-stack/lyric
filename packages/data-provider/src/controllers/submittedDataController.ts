import { NextFunction, Request, Response } from 'express';
import * as _ from 'lodash-es';

import { Dependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { isEmptyString } from '../utils/formatUtils.js';
import { SubmittedDataPaginatedResponse } from '../utils/types.js';

const controller = (dependencies: Dependencies) => {
	const service = submittedDataService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMITTED_DATA_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		getSubmittedDataByCategory: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				let page = parseInt(req.query.page as string) || defaultPage;
				let pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				if (page < 0) {
					throw new BadRequest('Invalid `page` parameter. Expecting a numeric value greater than 0');
				}

				if (pageSize < 0) {
					throw new BadRequest('Invalid `pageSize` parameter. Expecting a numeric value greater than 0');
				}

				if (_.isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				const submittedDataResult = await service.getSubmittedDataByCategory(categoryId, { page, pageSize });

				if (_.isEmpty(submittedDataResult.data)) throw new NotFound('No Submitted Data found');

				return res.status(200).send({
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.data,
				} as SubmittedDataPaginatedResponse);
			} catch (error) {
				next(error);
			}
		},
		getSubmittedDataByOrganization: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				let page = parseInt(req.query.page as string) || defaultPage;
				let pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}' and organization '${organization}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				if (page < 0) {
					throw new BadRequest('Invalid `page` parameter');
				}

				if (pageSize < 0) {
					throw new BadRequest('Invalid `pageSize` parameter');
				}

				if (_.isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

				const submittedDataResult = await service.getSubmittedDataByOrganization(categoryId, organization, {
					page,
					pageSize,
				});

				if (submittedDataResult.metadata.errorMessage) {
					throw new NotFound(submittedDataResult.metadata.errorMessage);
				}

				return res.status(200).send({
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.data,
				} as SubmittedDataPaginatedResponse);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
