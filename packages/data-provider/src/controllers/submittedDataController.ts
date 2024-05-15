import { NextFunction, Request, Response } from 'express';
import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { isEmptyString } from '../utils/formatUtils.js';
import { isCombination } from '@overture-stack/sqon-builder';
import { SubmittedDataPaginatedResponse } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submittedDataService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMITTED_DATA_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		getSubmittedDataByCategory: async (
			req: Request<{ categoryId: string }, {}, {}, { pageSize: string; page: string }>,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

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

				const response: SubmittedDataPaginatedResponse = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.data,
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		},
		getSubmittedDataByOrganization: async (
			req: Request<{ categoryId: string; organization: string }, {}, {}, { page: string; pageSize: string }>,
			res: Response,
			next: NextFunction,
		) => {
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

				const responsePaginated: SubmittedDataPaginatedResponse = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.data,
				};

				return res.status(200).send(responsePaginated);
			} catch (error) {
				next(error);
			}
		},

		getSubmittedDataByQuery: async (
			req: Request<{ categoryId: string; organization: string }, {}, any, { page: string; pageSize: string }>,
			res: any,
			next: any,
		) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				const sqon = req.body;
				let page = parseInt(req.query.page as string) || defaultPage;
				let pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					'Request Query Submitted Data',
					`categoryId '${categoryId}'`,
					`organization '${organization}'`,
					`sqon '${JSON.stringify(sqon)}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				if (_.isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}
				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}
				if (page < 0) {
					throw new BadRequest('Invalid `page` parameter');
				}

				if (pageSize < 0) {
					throw new BadRequest('Invalid `pageSize` parameter');
				}

				// The top level of a SQON must always be a Combination Operation, even if only a single filter is being applied.
				// https://www.overture.bio/documentation/arranger/reference/sqon/
				if (!isCombination(sqon)) {
					throw new BadRequest('Invalid SQON format');
				}

				const submittedDataResult = await service.getSubmittedDataByOrganization(
					categoryId,
					organization,
					{
						page,
						pageSize,
					},
					sqon,
				);

				if (submittedDataResult.metadata.errorMessage) {
					throw new NotFound(submittedDataResult.metadata.errorMessage);
				}

				const responsePaginated: SubmittedDataPaginatedResponse = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.data,
				};

				return res.status(200).send(responsePaginated);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
