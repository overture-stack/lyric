import { NextFunction, Request, Response } from 'express';
import { isEmpty } from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import submissionService from '../services/submissionService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { hasTsvExtension } from '../utils/fileUtils.js';
import { isEmptyString, isValidIdNumber } from '../utils/formatUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import { uploadSubmissionRequestSchema } from '../utils/schemas.js';
import { BATCH_ERROR_TYPE, BatchError } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const service = submissionService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		commit: async (req: Request<{ categoryId: string; submissionId: string }>, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const submissionId = Number(req.params.submissionId);

				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}
				if (!isValidIdNumber(submissionId)) {
					throw new BadRequest('Request provided an invalid submission ID');
				}

				logger.info(LOG_MODULE, `Request Commit Active Submission '${submissionId}' on category '${categoryId}'`);

				const commitSubmission = await service.commitSubmission(categoryId, submissionId);

				return res.status(200).send(commitSubmission);
			} catch (error) {
				next(error);
			}
		},
		delete: async (req: Request<{ submissionId: string }>, res: Response, next: NextFunction) => {
			try {
				const submissionId = Number(req.params.submissionId);

				if (!isValidIdNumber(submissionId)) {
					throw new BadRequest('Request provided an invalid submission ID');
				}

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
		},
		deleteEntityName: async (
			req: Request<{ submissionId: string; entityName: string }>,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const submissionId = Number(req.params.submissionId);
				const entityName = req.params.entityName;

				if (!isValidIdNumber(submissionId)) {
					throw new BadRequest('Request provided an invalid submission ID');
				}

				if (isEmptyString(entityName)) {
					throw new BadRequest('Request is missing `entityName` parameter.');
				}

				logger.info(LOG_MODULE, `Request Delete entity '${entityName}' on Active Submission '${submissionId}'`);

				// TODO: get userName from auth
				const userName = '';

				const activeSubmission = await service.deleteActiveSubmissionEntity(submissionId, entityName, userName);

				if (isEmpty(activeSubmission)) {
					throw new NotFound('Active Submission not found');
				}

				return res.status(200).send(activeSubmission);
			} catch (error) {
				next(error);
			}
		},
		getActiveByCategory: async (req: Request<{ categoryId: string }>, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}

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
		},
		getActiveById: async (req: Request<{ submissionId: string }>, res: Response, next: NextFunction) => {
			try {
				const submissionId = Number(req.params.submissionId);

				if (!isValidIdNumber(submissionId)) {
					throw new BadRequest('Request provided an invalid submission ID');
				}

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
		},
		getActiveByOrganization: async (
			req: Request<{ categoryId: string; organization: string }>,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;

				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}

				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

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
		},
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

				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}

				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

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
