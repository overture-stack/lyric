import { NextFunction, Request, Response } from 'express';

import { isNaN } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import submissionService from '../services/submissionService.js';
import { BadRequest, NotImplemented, getErrorMessage } from '../utils/errors.js';
import { validateTsvExtension } from '../utils/fileUtils.js';
import { BATCH_ERROR_TYPE, BatchError, CREATE_SUBMISSION_STATE } from '../utils/types.js';

const controller = (dependencies: Dependencies) => {
	const service = submissionService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMISSION_CONTROLLER';
	return {
		upload: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const files = req.files as Express.Multer.File[];

				logger.info(
					LOG_MODULE,
					`Upload Submission Request categoryId '${categoryId}' files '${files?.map((f) => f.originalname)}'`,
				);

				if (isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
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

				const resultSubmission = await service.uploadSubmission(validFiles, categoryId);

				let status = 400;
				if (fileErrors.length == 0 && resultSubmission.batchErrors.length == 0) {
					status = 200;
					logger.info(LOG_MODULE, `Submission uploaded successfully`);
				} else {
					logger.error(LOG_MODULE, 'Found some errors processing this request');
				}
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
		listActive: async (req: Request, res: Response, next: NextFunction) => {
			try {
				// TODO: Get active submissions for a category
				throw new NotImplemented();
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
