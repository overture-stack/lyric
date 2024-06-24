import { NextFunction, Request, Response } from 'express';

import { BaseDependencies } from '../config/config.js';
import categorySvc from '../services/categoryService.js';
import { BadRequest } from '../utils/errors.js';
import { isValidIdNumber } from '../utils/formatUtils.js';

const controller = (dependencies: BaseDependencies) => {
	const categoryService = categorySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'CATEGORY_CONTROLLER';
	return {
		getDetails: async (req: Request<{ categoryId: string }>, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);

				if (!isValidIdNumber(categoryId)) {
					throw new BadRequest('Request provided an invalid category ID');
				}

				logger.info(LOG_MODULE, 'Request Get Category Details', `categoryId '${categoryId}'`);

				const details = await categoryService.getDetails(categoryId);

				if (!details) {
					throw new BadRequest('Category not found');
				}
				return res.send(details);
			} catch (error) {
				next(error);
			}
		},
		listAll: async (req: Request, res: Response, next: NextFunction) => {
			try {
				logger.info(LOG_MODULE, `List All Categories request`);

				const categoryList = await categoryService.listAll();
				return res.send(categoryList);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
