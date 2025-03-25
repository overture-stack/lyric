import { isEmpty } from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submissionService from '../services/submission/submission.js';
import submittedDataService from '../services/submittedData/submmittedData.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	dataDeleteBySystemIdRequestSchema,
	dataEditRequestSchema,
	submissionActiveByOrganizationRequestSchema,
	submissionByIdRequestSchema,
	submissionCommitRequestSchema,
	submissionDeleteEntityNameRequestSchema,
	submissionDeleteRequestSchema,
	submissionsByCategoryRequestSchema,
	uploadSubmissionRequestSchema,
} from '../utils/schemas.js';
import { SUBMISSION_ACTION_TYPE } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submissionService(dependencies);
	const dataService = submittedDataService(dependencies);
	const { logger } = dependencies;
	const defaultPage = 1;
	const defaultPageSize = 20;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		commit: validateRequest(submissionCommitRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const submissionId = Number(req.params.submissionId);

				// Get userName from auth
				const userName = req.user?.username || '';

				logger.info(LOG_MODULE, `Request Commit Active Submission '${submissionId}' on category '${categoryId}'`);

				const commitSubmission = await service.commitSubmission(categoryId, submissionId, userName);

				return res.status(200).send(commitSubmission);
			} catch (error) {
				next(error);
			}
		}),
		delete: validateRequest(submissionDeleteRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);

				logger.info(LOG_MODULE, `Request Delete Active Submission '${submissionId}'`);

				// Get userName from auth
				const userName = req.user?.username || '';

				const activeSubmissionDelete = await service.deleteActiveSubmissionById(submissionId, userName);

				if (isEmpty(activeSubmissionDelete)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(activeSubmissionDelete);
			} catch (error) {
				next(error);
			}
		}),
		deleteEntityName: validateRequest(submissionDeleteEntityNameRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);
				const actionType = SUBMISSION_ACTION_TYPE.parse(req.params.actionType.toUpperCase());

				const entityName = req.query.entityName;
				const index = req.query.index ? parseInt(req.query.index) : null;

				logger.info(
					LOG_MODULE,
					`Request Delete '${entityName ? entityName : 'all'}' records on '{${actionType}}' Active Submission '${submissionId}'`,
				);

				// Get userName from auth
				const userName = req.user?.username || '';

				const activeSubmission = await service.deleteActiveSubmissionEntity(submissionId, userName, {
					actionType,
					entityName,
					index,
				});

				if (isEmpty(activeSubmission)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(activeSubmission);
			} catch (error) {
				next(error);
			}
		}),
		deleteSubmittedDataBySystemId: validateRequest(dataDeleteBySystemIdRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const systemId = req.params.systemId;

				logger.info(LOG_MODULE, `Request Delete Submitted Data systemId '${systemId}' on categoryId '${categoryId}'`);

				// Get userName from auth
				const userName = req.user?.username || '';

				const deletedRecordsResult = await dataService.deleteSubmittedDataBySystemId(categoryId, systemId, userName);

				const response = {
					status: deletedRecordsResult.status,
					description: deletedRecordsResult.description,
					inProcessEntities: deletedRecordsResult.inProcessEntities,
					submissionId: deletedRecordsResult.submissionId,
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),

		editSubmittedData: validateRequest(dataEditRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const entityName = req.query.entityName;
				const organization = req.query.organization;
				const payload = req.body;

				logger.info(LOG_MODULE, `Request Edit Submitted Data`);

				// Get userName from auth
				const userName = req.user?.username || '';

				if (!payload || payload.length == 0) {
					throw new BadRequest(
						'The "payload" parameter is missing or empty. Please include the records in the request for processing.',
					);
				}

				const editSubmittedDataResult = await dataService.editSubmittedData({
					records: payload,
					entityName,
					categoryId,
					organization,
					userName,
				});

				// This response provides the details of data Submission
				return res.status(200).send(editSubmittedDataResult);
			} catch (error) {
				next(error);
			}
		}),
		getSubmissionsByCategory: validateRequest(submissionsByCategoryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const onlyActive = req.query.onlyActive?.toLowerCase() === 'true';
				const organization = req.query.organization;
				const page = parseInt(String(req.query.page)) || defaultPage;
				const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submission categoryId '${categoryId}'`,
					`pagination params: page '${page}' pageSize '${pageSize}'`,
					`onlyActive '${onlyActive}'`,
					`organization '${organization}'`,
				);

				// Get userName from auth
				const userName = req.user?.username || '';

				const submissionsResult = await service.getSubmissionsByCategory(
					categoryId,
					{ page, pageSize },
					{ onlyActive, userName, organization },
				);

				if (isEmpty(submissionsResult.result)) {
					throw new NotFound('Submissions not found');
				}

				const response = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submissionsResult.metadata.totalRecords / pageSize),
						totalRecords: submissionsResult.metadata.totalRecords,
					},
					records: submissionsResult.result,
				};

				return res.status(200).send(response);
			} catch (error) {
				next(error);
			}
		}),
		getSubmissionById: validateRequest(submissionByIdRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);

				logger.info(LOG_MODULE, `Request Active Submission submissionId '${submissionId}'`);

				const submission = await service.getSubmissionById(submissionId);

				if (isEmpty(submission)) {
					throw new NotFound('Submission not found');
				}

				return res.status(200).send(submission);
			} catch (error) {
				next(error);
			}
		}),
		getActiveByOrganization: validateRequest(submissionActiveByOrganizationRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;

				logger.info(
					LOG_MODULE,
					`Request Active Submission categoryId '${categoryId}' and organization '${organization}'`,
				);

				// Get userName from auth
				const userName = req.user?.username || '';

				const activeSubmission = await service.getActiveSubmissionByOrganization({
					categoryId,
					userName,
					organization,
				});

				if (isEmpty(activeSubmission)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(activeSubmission);
			} catch (error) {
				next(error);
			}
		}),
		submit: validateRequest(uploadSubmissionRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const entityName = req.query.entityName;
				const organization = req.query.organization;
				const payload = req.body;

				// Get userName from auth
				const userName = req.user?.username || '';

				logger.info(
					LOG_MODULE,
					`Submission Request: categoryId '${categoryId}'`,
					` organization '${organization}'`,
					` entityName '${entityName}'`,
				);

				if (!payload || payload.length == 0) {
					throw new BadRequest(
						'The "payload" parameter is missing or empty. Please include the records in the request for processing.',
					);
				}

				const resultSubmission = await service.submit({
					records: payload,
					entityName,
					categoryId,
					organization,
					userName,
				});

				// This response provides the details of data Submission
				return res.status(200).send(resultSubmission);
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
