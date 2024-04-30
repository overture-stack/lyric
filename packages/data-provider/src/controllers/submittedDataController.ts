import { NextFunction, Request, Response } from 'express';
import * as _ from 'lodash-es';

import { Dependencies } from '../config/config.js';
import submittedDataService from '../services/submittedDataService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { isEmptyString } from '../utils/formatUtils.js';

const controller = (dependencies: Dependencies) => {
	const service = submittedDataService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'SUBMITTED_DATA_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;
	return {
		getSubmittedDataByCategory: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				let page = parseInt(req.query.page as string) || defaultPage;
				let pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(
					LOG_MODULE,
					`Request Submitted Data on categoryId '${categoryId}' page '${page}' pageSize '${pageSize}'`,
				);

				if (_.isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				const data = await service.getSubmittedDataByCategory(categoryId, { page, pageSize });

				if (_.isEmpty(data)) throw new NotFound('No Submitted Data found');

				return res.status(200).send(data);
			} catch (error) {
				next(error);
			}
		},
		getSubmittedDataByOrganization: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const organization = req.params.organization;
				let page = parseInt(req.query.page as string) || defaultPage;
				let pageSize = parseInt(req.query.pageSize as string) || defaultPageSize;

				logger.info(LOG_MODULE, `Request Submitted Data on categoryId '${categoryId}' organization '${organization}'`);

				if (_.isNaN(categoryId)) {
					throw new BadRequest('Invalid categoryId number format');
				}

				if (isEmptyString(organization)) {
					throw new BadRequest('Request is missing `organization` parameter.');
				}

				const data = await service.getSubmittedDataByOrganization(categoryId, organization, { page, pageSize });

				if (_.isEmpty(data)) throw new NotFound('No Submitted Data found');

				return res.status(200).send(data);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
