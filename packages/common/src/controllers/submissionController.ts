import { NextFunction, Request, Response } from 'express';

import { Dependencies } from '../config/config.js';
import submissionService from '../services/submissionService.js';
import { NotImplemented, getErrorMessage } from '../utils/errors.js';
import { tsvToJson, validateTsvExtension } from '../utils/fileUtils.js';
import { BATCH_ERROR_TYPE, BatchError, SubmissionEntity } from '../utils/types.js';

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
					`Upload Submission Request categoryId '${categoryId}' files '${files.map((f) => f.originalname)}'`,
				);

				const fileErrors: BatchError[] = [];
				const rawSubmissionEntities: SubmissionEntity[] = [];

				for (const file of files) {
					try {
						validateTsvExtension(file);

						const parsedData = await tsvToJson(file.path);
						logger.debug(
							LOG_MODULE,
							`Request file '${file.originalname}' parsed in JSON format'${JSON.stringify(parsedData)}'`,
						);
						rawSubmissionEntities.push({
							batchName: file.originalname,
							creator: '', //TODO: get user from auth
							records: parsedData,
						});
					} catch (error) {
						logger.error(LOG_MODULE, `Error processing file '${file.originalname}'`, getErrorMessage(error));

						const batchError: BatchError = {
							message: getErrorMessage(error),
							type: BATCH_ERROR_TYPE.TSV_PARSING_FAILED,
							batchName: file.originalname,
						};

						fileErrors.push(batchError);
					}
				}

				const resultSubmission = await service.uploadSubmission(rawSubmissionEntities, categoryId);

				let status = 201;
				if (!resultSubmission.successful || fileErrors.length > 0 || resultSubmission.batchErrors.length > 0) {
					status = 422;
					logger.error(
						LOG_MODULE,
						'Submission uploaded with errors',
						fileErrors.length > 0 ? JSON.stringify(fileErrors) : JSON.stringify(resultSubmission?.batchErrors),
					);
				} else {
					logger.info(LOG_MODULE, `Submission uploaded successfully`);
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
