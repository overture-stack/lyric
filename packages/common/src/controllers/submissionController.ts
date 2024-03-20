import { NextFunction, Request, Response } from 'express';

import { isEmpty, isNaN } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import submissionService from '../services/submissionService.js';
import { BadRequest, NotFound, NotImplemented, getErrorMessage } from '../utils/errors.js';
import { validateTsvExtension } from '../utils/fileUtils.js';
import { BATCH_ERROR_TYPE, BatchError } from '../utils/types.js';

const controller = (dependencies: Dependencies) => {
	const service = submissionService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		upload: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const files = req.files as Express.Multer.File[];
				const organization = req.body.organization;

				logger.info(
					LOG_MODULE,
					`Upload Submission Request categoryId '${categoryId}' organization '${organization}' files '${files?.map((f) => f.originalname)}'`,
				);

				if (isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				if (!organization) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

				if (!files || files.length == 0) {
					throw new BadRequest('Request is missing attach `files`');
				}

				const fileErrors: BatchError[] = [];
				const validFiles: Express.Multer.File[] = [];

				for (const file of files) {
					try {
						validateTsvExtension(file);
						validFiles.push(file);
					} catch (error) {
						logger.error(LOG_MODULE, `Error processing file '${file.originalname}'`, getErrorMessage(error));

						const batchError: BatchError = {
							type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
							message: getErrorMessage(error),
							batchName: file.originalname,
						};

						fileErrors.push(batchError);
					}
				}

				const resultSubmission = await service.uploadSubmission(validFiles, categoryId, organization);

				if (fileErrors.length == 0 && resultSubmission.batchErrors.length == 0) {
					logger.info(LOG_MODULE, `Submission uploaded successfully`);
				} else {
					logger.error(LOG_MODULE, 'Found some errors processing this request');
				}

				// HTTP 200 status Submission Accepted
				const status = 200;

				// This response provides the details of file Submission
				return res
					.status(status)
					.send({ ...resultSubmission, batchErrors: [...fileErrors, ...resultSubmission?.batchErrors] });
			} catch (error) {
				next(error);
			}
		},
		commit: async (req: Request, res: Response, next: NextFunction) => {
			try {
				// TODO: Commit active submissions
				throw new NotImplemented();
			} catch (error) {
				next(error);
			}
		},
		active: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				if (isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				logger.info(LOG_MODULE, `Request Active Submission categoryId '${categoryId}'`);

				const activeSubmission = await service.activeSubmission(categoryId);

				if (isEmpty(activeSubmission)) throw new NotFound('Active Submission not found');

				return res.status(200).send(activeSubmission);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
