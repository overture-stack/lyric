import { isEmpty } from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submissionService from '../services/submissionService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { hasTsvExtension } from '../utils/fileUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	submissionActiveByIdRequestSchema,
	submissionActiveByOrganizationRequestSchema,
	submissionActiveyByCategoryRequestSchema,
	submissionCommitRequestSchema,
	submissionDeleteEntityNameRequestSchema,
	submissionDeleteRequestSchema,
	uploadSubmissionRequestSchema,
} from '../utils/schemas.js';
import { BATCH_ERROR_TYPE, BatchError, SUBMISSION_ACTION_TYPE } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submissionService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		commit: validateRequest(submissionCommitRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const submissionId = Number(req.params.submissionId);

				logger.info(LOG_MODULE, `Request Commit Active Submission '${submissionId}' on category '${categoryId}'`);

				const commitSubmission = await service.commitSubmission(categoryId, submissionId);

				return res.status(200).send(commitSubmission);
			} catch (error) {
				next(error);
			}
		}),
		delete: validateRequest(submissionDeleteRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);

				logger.info(LOG_MODULE, `Request Delete Active Submission '${submissionId}'`);

				// TODO: get userName from auth
				const userName = '';

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
				const index = req.query.index ? parseInt(req.query.index) : undefined;

				logger.info(
					LOG_MODULE,
					`Request Delete '${entityName ? entityName : 'all'}' records on '{${actionType}}' Active Submission '${submissionId}'`,
				);

				// TODO: get userName from auth
				const userName = '';

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
		getActiveByCategory: validateRequest(submissionActiveyByCategoryRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);

				logger.info(LOG_MODULE, `Request Active Submission categoryId '${categoryId}'`);

				// TODO: get userName from auth
				const userName = '';

				const activeSubmissions = await service.getActiveSubmissionsByCategory({ categoryId, userName });

				if (!activeSubmissions || activeSubmissions.length === 0) {
					throw new NotFound('Active Submission not found');
				}

				logger.info(LOG_MODULE, `Found '${activeSubmissions.length}' Active Submissions`);

				return res.status(200).send(activeSubmissions);
			} catch (error) {
				next(error);
			}
		}),
		getActiveById: validateRequest(submissionActiveByIdRequestSchema, async (req, res, next) => {
			try {
				const submissionId = Number(req.params.submissionId);

				logger.info(LOG_MODULE, `Request Active Submission submissionId '${submissionId}'`);

				// TODO: get userName from auth
				// const userName = '';

				const activeSubmission = await service.getActiveSubmissionById(submissionId);

				if (isEmpty(activeSubmission)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(activeSubmission);
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

				// TODO: get userName from auth
				const userName = '';

				const activeSubmission = await service.getActiveSubmissionByOrganization({
					categoryId,
					userName,
					organization,
				});

				if (isEmpty(activeSubmission)) throw new NotFound('Active Submission not found');

				return res.status(200).send(activeSubmission);
			} catch (error) {
				next(error);
			}
		}),
		upload: validateRequest(uploadSubmissionRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const files = req.files as Express.Multer.File[];
				const organization = req.body.organization;

				// TODO: get userName from auth
				const userName = '';

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
						if (hasTsvExtension(file)) {
							acc.validFiles.push(file);
						} else {
							const batchError: BatchError = {
								type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
								message: `File '${file.originalname}' has invalid file extension. File extension must be '.tsv'.`,
								batchName: file.originalname,
							};
							acc.fileErrors.push(batchError);
						}
						return acc;
					},
					{ validFiles: [], fileErrors: [] },
				);

				const resultSubmission = await service.uploadSubmission({
					files: validFiles,
					categoryId,
					organization,
					userName,
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
