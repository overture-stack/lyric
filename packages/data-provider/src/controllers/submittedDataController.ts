import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { parseSQON } from '../utils/convertSqonToQuery.js';
import { NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	dataDeleteBySystemIdRequestSchema,
	dataGetByCategoryRequestSchema,
	dataGetByOrganizationRequestSchema,
	dataGetByQueryRequestschema,
} from '../utils/schemas.js';
import { SubmittedDataPaginatedResponse } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submittedDataService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMITTED_DATA_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		deleteSubmittedDataBySystemId: validateRequest(dataDeleteBySystemIdRequestSchema, async (req, res, next) => {
			try {
				const systemId = req.params.systemId;

				// Gives false value except when query param is explicitly true
				const dryRun = req.query.dryRun?.toLowerCase() === 'true';

				const comment = req.query.comment;

				logger.info(LOG_MODULE, `Request Delete Submitted Data systemId '${systemId}' dryRun '${dryRun}'`);

				// TODO: get userName from auth
				const userName = '';

				const deletedRecords = await service.deleteSubmittedDataBySystemId(systemId, dryRun, comment, userName);

				const response = {
					data: deletedRecords,
					metadata: {
						totalRecords: deletedRecords.length,
						dryRun,
					},
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),

		getSubmittedDataByCategory: validateRequest(dataGetByCategoryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByCategory(categoryId, { page, pageSize });

				if (_.isEmpty(submittedDataResult.data)) {
					throw new NotFound('No Submitted Data found');
				}

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
		}),

		getSubmittedDataByOrganization: validateRequest(dataGetByOrganizationRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}' and organization '${organization}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

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
		}),

		getSubmittedDataByQuery: validateRequest(dataGetByQueryRequestschema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				const sqon = parseSQON(req.body);
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
		}),
	};
};

export default controller;
