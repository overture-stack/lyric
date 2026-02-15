import type { Response } from 'express';
import { isEmpty } from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import { type AuthConfig, shouldBypassAuth } from '../middleware/auth.js';
import submissionService from '../services/submission/submissionService.js';
import submittedDataService from '../services/submittedData/submmittedData.js';
import { hasUserWriteAccess } from '../utils/authUtils.js';
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import { extractFileExtension, SUPPORTED_FILE_EXTENSIONS } from '../utils/fileUtils.js';
import { asArray } from '../utils/formatUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	dataDeleteBySystemIdRequestSchema,
	editSingleEntityRequestSchema,
	submissionActiveByOrganizationRequestSchema,
	submissionByIdRequestSchema,
	submissionCommitRequestSchema,
	submissionDeleteEntityNameRequestSchema,
	submissionDeleteRequestSchema,
	submissionDetailsRequestSchema,
	submissionsByCategoryRequestSchema,
	uploadSingleEntitySubmissionDataRequestSchema,
	uploadSubmissionRequestSchema,
} from '../utils/schemas.js';
import { parseSubmissionActionTypes } from '../utils/submissionUtils.js';
import {
	BATCH_ERROR_TYPE,
	BatchError,
	type PaginatedResponse,
	SUBMISSION_ACTION_TYPE,
	type SubmissionSummary,
} from '../utils/types.js';

const controller = ({
	baseDependencies,
	authConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
}) => {
	const service = submissionService(baseDependencies);
	const dataService = submittedDataService(baseDependencies);
	const { logger } = baseDependencies;
	const defaultPage = 1;
	const defaultPageSize = 20;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		commit: validateRequest(submissionCommitRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const submissionId = Number(req.params.submissionId);
				const user = req.user;

				logger.info(LOG_MODULE, `Request Commit Active Submission '${submissionId}' on category '${categoryId}'`);

				const submission = await service.getSubmissionById(submissionId);
				if (!submission) {
					throw new BadRequest(`Submission '${submissionId}' not found`);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(submission.organization, user)) {
					throw new Forbidden(`User is not authorized to commit the submission from '${submission.organization}'`);
				}

				const username = user?.username || '';

				const commitSubmission = await service.commitSubmission(categoryId, submissionId, username);

				return res.status(200).send(commitSubmission);
			} catch (error) {
				next(error);
			}
		}),
		delete: validateRequest(submissionDeleteRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);
				const user = req.user;

				logger.info(LOG_MODULE, `Request Delete Active Submission '${submissionId}'`);

				const submission = await service.getSubmissionById(submissionId);
				if (!submission) {
					throw new BadRequest(`Submission '${submissionId}' not found`);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(submission.organization, user)) {
					throw new Forbidden(`User is not authorized to delete the submission from '${submission.organization}'`);
				}

				const username = user?.username || '';

				const deleteSubmissionResult = await service.deleteActiveSubmissionById(submissionId, username);

				if (isEmpty(deleteSubmissionResult)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(deleteSubmissionResult);
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
				const user = req.user;

				logger.info(
					LOG_MODULE,
					`Request Delete '${entityName ? entityName : 'all'}' records on '{${actionType}}' Active Submission '${submissionId}'`,
				);

				const submission = await service.getSubmissionById(submissionId);
				if (!submission) {
					throw new BadRequest(`Submission '${submissionId}' not found`);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(submission.organization, user)) {
					throw new Forbidden(`User is not authorized to delete the submission data from '${submission.organization}'`);
				}

				const username = user?.username || '';

				const deleteSubmissionEntityResult = await service.deleteActiveSubmissionEntity(submissionId, username, {
					actionType,
					entityName,
					index,
				});

				if (isEmpty(deleteSubmissionEntityResult)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(deleteSubmissionEntityResult);
			} catch (error) {
				next(error);
			}
		}),
		deleteSubmittedDataBySystemId: validateRequest(dataDeleteBySystemIdRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const systemId = req.params.systemId;
				const user = req.user;

				logger.info(LOG_MODULE, `Request Delete Submitted Data systemId '${systemId}' on categoryId '${categoryId}'`);

				// get SubmittedData by SystemId
				const foundRecordToDelete = await dataService.getSubmittedDataBySystemId(categoryId, systemId, {
					view: 'flat',
				});

				if (!foundRecordToDelete.result) {
					throw new BadRequest(`No Submitted data found with systemId '${systemId}'`);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(foundRecordToDelete.result.organization, user)) {
					throw new Forbidden(
						`User is not authorized to delete data from '${foundRecordToDelete.result?.organization}'`,
					);
				}

				const username = user?.username || '';

				const deletedRecordsResult = await dataService.deleteSubmittedDataBySystemId(categoryId, systemId, username);

				return res.status(200).send(deletedRecordsResult);
			} catch (error) {
				next(error);
			}
		}),

		editSubmittedData: validateRequest(editSingleEntityRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const entityName = req.params.entityName;
				const organization = req.params.organizationId;
				const payload = req.body;
				const user = req.user;

				logger.info(LOG_MODULE, `Request Edit Submitted Data`);

				if (!payload || payload.length == 0) {
					throw new BadRequest(
						'The "payload" parameter is missing or empty. Please include the records in the request for processing.',
					);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(organization, user)) {
					throw new Forbidden(`User is not authorized to edit data from '${organization}'`);
				}

				const username = user?.username || '';

				const editSubmittedDataResult = await dataService.editSubmittedData({
					records: payload,
					entityName,
					categoryId,
					organization,
					username,
				});

				// This response provides the details of data Submission
				return res.status(200).send(editSubmittedDataResult);
			} catch (error) {
				next(error);
			}
		}),
		getSubmissionsByCategory: validateRequest(
			submissionsByCategoryRequestSchema,
			async (req, res: Response<PaginatedResponse<SubmissionSummary>>, next) => {
				try {
					const categoryId = Number(req.params.categoryId);
					const onlyActive = req.query.onlyActive?.toLowerCase() === 'true';
					const organization = req.query.organization;
					const page = parseInt(String(req.query.page)) || defaultPage;
					const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;
					const username = req.query.username;

					logger.info(
						LOG_MODULE,
						`Request Submission categoryId '${categoryId}'`,
						`pagination params: page '${page}' pageSize '${pageSize}'`,
						`onlyActive '${onlyActive}'`,
						`organization '${organization}'`,
					);

					const submissionsResult = await service.getSubmissionsByCategory(
						categoryId,
						{ page, pageSize },
						{ onlyActive, username, organization },
					);

					const response: PaginatedResponse<SubmissionSummary> = {
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
			},
		),
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
		getSubmissionDetailsById: validateRequest(submissionDetailsRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);
				const entityNames = asArray(req.query.entityNames || []);

				const actionTypes = parseSubmissionActionTypes(req.query.actionTypes || SUBMISSION_ACTION_TYPE.options);

				// query params
				const page = parseInt(String(req.query.page)) || defaultPage;
				const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;

				logger.info(LOG_MODULE, `Request Submission Details by ID '${submissionId}'`);

				const submission = await service.getSubmissionDetailsById({
					submissionId,
					paginationOptions: { page, pageSize },
					filterOptions: { entityNames, actionTypes },
				});

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

				// Get username from auth
				const username = req.user?.username || '';

				const activeSubmission = await service.getActiveSubmissionByOrganization({
					categoryId,
					username,
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
		submitSingleEntityData: validateRequest(uploadSingleEntitySubmissionDataRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const entityName = req.params.entityName;
				const organization = req.params.organizationId;
				const payload = req.body;
				const user = req.user;

				logger.info(
					LOG_MODULE,
					`Submission Request: categoryId '${categoryId}'`,
					` organization '${organization}'`,
					` entityName '${entityName}'`,
				);

				// TODO: parse body payload

				if (!payload || !Array.isArray(payload) || payload.length == 0) {
					throw new BadRequest(
						'The "payload" parameter is missing or empty. Please include the records in the request for processing.',
					);
				}

				if (!shouldBypassAuth(req, authConfig) && !hasUserWriteAccess(organization, user)) {
					throw new Forbidden(`User is not authorized to submit data to '${organization}'`);
				}

				const username = user?.username || '';

				const resultSubmission = await service.submitJson({
					data: { [entityName]: payload },
					categoryId,
					organization,
					username,
				});

				// This response provides the details of data Submission
				return res.status(200).send(resultSubmission);
			} catch (error) {
				next(error);
			}
		}),

		submitFiles: validateRequest(uploadSubmissionRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const files = Array.isArray(req.files) ? req.files : [];
				const organization = req.params.organizationId;

				// Get username from auth
				const username = req.user?.username || '';

				logger.info(
					LOG_MODULE,
					`Upload Submission Request: categoryId '${categoryId}'`,
					` organization '${organization}'`,
					` files '${files?.map((f) => f.originalname)}'`,
				);

				if (!files || files.length == 0) {
					throw new BadRequest(
						'The "files" parameter is missing or empty. Please include files in the request for processing.',
					);
				}

				// sort files into validFiles and fileErrors based on correct file extension
				const { validFiles, fileErrors } = files.reduce<{
					validFiles: Express.Multer.File[];
					fileErrors: BatchError[];
				}>(
					(acc, file) => {
						if (extractFileExtension(file.originalname)) {
							acc.validFiles.push(file);
						} else {
							const batchError: BatchError = {
								type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
								message: `File '${file.originalname}' has invalid file extension. File extension must be '${SUPPORTED_FILE_EXTENSIONS.options}'.`,
								batchName: file.originalname,
							};
							acc.fileErrors.push(batchError);
						}
						return acc;
					},
					{ validFiles: [], fileErrors: [] },
				);

				const resultSubmission = await service.submitFiles({
					files: validFiles,
					categoryId,
					organization,
					username,
				});

				if (fileErrors.length == 0 && resultSubmission.batchErrors.length == 0) {
					logger.info(LOG_MODULE, `Submission uploaded successfully`);
				} else {
					logger.info(LOG_MODULE, 'Found some errors processing this request');
				}

				// This response provides the details of file Submission
				return res
					.status(200)
					.send({ ...resultSubmission, batchErrors: [...fileErrors, ...resultSubmission.batchErrors] });
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
