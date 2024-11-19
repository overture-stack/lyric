import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { parseSQON } from '../utils/convertSqonToQuery.js';
import { NotFound } from '../utils/errors.js';
import { asArray } from '../utils/formatUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	dataGetByCategoryRequestSchema,
	dataGetByOrganizationRequestSchema,
	dataGetByQueryRequestSchema,
	dataGetBySystemIdRequestSchema,
} from '../utils/schemas.js';
import { SubmittedDataPaginatedResponse, VIEW_TYPE } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submittedDataService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMITTED_DATA_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	const defaultView = VIEW_TYPE.Values.flat;

	return {
		getSubmittedDataByCategory: validateRequest(dataGetByCategoryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);

				// query params
				const entityName = asArray(req.query.entityName || []);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;
				const view = req.query.view || defaultView;

				const parsedView = VIEW_TYPE.safeParse(view);
				if (!parsedView.success) {
					throw new Error('Invalid view type provided');
				}

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
					`view '${view}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByCategory(
					categoryId,
					{ page, pageSize },
					{ entityName, view: parsedView.data },
				);

				if (_.isEmpty(submittedDataResult.result)) {
					throw new NotFound('No Submitted Data found');
				}

				const response: SubmittedDataPaginatedResponse = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submittedDataResult.metadata.totalRecords / pageSize),
						totalRecords: submittedDataResult.metadata.totalRecords,
					},
					records: submittedDataResult.result,
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),

		getSubmittedDataByOrganization: validateRequest(dataGetByOrganizationRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;

				// query parameters
				const entityName = asArray(req.query.entityName || []);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;
				const view = req.query.view || defaultView;

				const parsedView = VIEW_TYPE.safeParse(view);
				if (!parsedView.success) {
					throw new Error('Invalid view type provided');
				}

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}' and organization '${organization}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
					`view '${view}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByOrganization(
					categoryId,
					organization,
					{
						page,
						pageSize,
					},
					{ entityName, view: parsedView.data },
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
					records: submittedDataResult.result,
				};

				return res.status(200).send(responsePaginated);
			} catch (error) {
				next(error);
			}
		}),

		getSubmittedDataByQuery: validateRequest(dataGetByQueryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				const sqon = parseSQON(req.body);

				// query parameters
				const entityName = asArray(req.query.entityName || []);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					'Request Query Submitted Data',
					`categoryId '${categoryId}'`,
					`organization '${organization}'`,
					`sqon '${JSON.stringify(sqon)}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByOrganization(
					categoryId,
					organization,
					{
						page,
						pageSize,
					},
					{ sqon, entityName, view: VIEW_TYPE.Values.flat },
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
					records: submittedDataResult.result,
				};

				return res.status(200).send(responsePaginated);
			} catch (error) {
				next(error);
			}
		}),
		getSubmittedDataBySystemId: validateRequest(dataGetBySystemIdRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const systemId = req.params.systemId;
				const view = req.query.view || defaultView;

				const parsedView = VIEW_TYPE.safeParse(view);
				if (!parsedView.success) {
					throw new Error('Invalid view type provided');
				}

				logger.info(
					LOG_MODULE,
					'Request Submitted Data',
					`categoryId '${categoryId}'`,
					`systemId '${systemId}'`,
					`params: view '${view}'`,
				);

				const submittedDataResult = await service.getSubmittedDataBySystemId(categoryId, systemId, {
					view: parsedView.data,
				});

				if (submittedDataResult.metadata.errorMessage) {
					throw new NotFound(submittedDataResult.metadata.errorMessage);
				}

				return res.status(200).send(submittedDataResult.result);
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
