import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { parseSQON } from '../utils/convertSqonToQuery.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { processFiles } from '../utils/fileUtils.js';
import { asArray } from '../utils/formatUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	dataDeleteBySystemIdRequestSchema,
	dataEditRequestSchema,
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

				logger.info(LOG_MODULE, `Request Delete Submitted Data systemId '${systemId}'`);

				// TODO: get userName from auth
				const userName = '';

				const deletedRecords = await service.deleteSubmittedDataBySystemId(systemId, userName);

				const response = {
					submissionId: deletedRecords.submissionId,
					records: deletedRecords.data,
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),

		editSubmittedData: validateRequest(dataEditRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const files = req.files as Express.Multer.File[];
				const organization = req.body.organization;

				logger.info(LOG_MODULE, `Request Edit Submitted Data`);

				// TODO: get userName from auth
				const userName = '';

				if (!files || files.length == 0) {
					throw new BadRequest(
						'The "files" parameter is missing or empty. Please include files in the request for processing.',
					);
				}

				const { validFiles, fileErrors } = await processFiles(files);

				if (fileErrors.length == 0) {
					logger.info(LOG_MODULE, `File uploaded successfully`);
				} else {
					logger.info(LOG_MODULE, 'Found some errors processing this request');
				}

				const editSubmittedDataResult = await service.editSubmittedData({
					files: validFiles,
					categoryId,
					organization,
					userName,
				});

				const response = {
					status: editSubmittedDataResult.status,
					submissionId: editSubmittedDataResult.submissionId,
					inProcessEntities: editSubmittedDataResult.inProcessEntities,
					batchErrors: [...fileErrors, ...editSubmittedDataResult.batchErrors],
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),

		getSubmittedDataByCategory: validateRequest(dataGetByCategoryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);

				// query params
				const entityName = asArray(req.query.entityName);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByCategory(
					categoryId,
					{ page, pageSize },
					{ entityName },
				);

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

				// query parameters
				const entityName = asArray(req.query.entityName);
				const page = parseInt(req.query.page as string) || defaultPage;
				const pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}' and organization '${organization}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
				);

				const submittedDataResult = await service.getSubmittedDataByOrganization(
					categoryId,
					organization,
					{
						page,
						pageSize,
					},
					{ entityName },
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

		getSubmittedDataByQuery: validateRequest(dataGetByQueryRequestschema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				const sqon = parseSQON(req.body);

				// query parameters
				const entityName = asArray(req.query.entityName);
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
					{ sqon, entityName },
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
