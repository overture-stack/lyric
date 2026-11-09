import { NextFunction, Request, Response } from 'express';

import { BaseDependencies } from '../config/config.js';
import type { AuthConfig } from '../middleware/auth.js';
import categorySvc from '../services/categoryService.js';
import { isUserAdmin } from '../utils/authUtils.js';
import { Forbidden, NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	categoryAliasAssignRequestSchema,
	categoryAliasUnassignRequestSchema,
	categoryDetailsRequestSchema,
} from '../utils/schemas.js';

/**
 * Handlers for the category routes. Assigning and removing an alias require an administrator while `authConfig`
 * enables auth, on every method.
 */
const controller = ({
	authConfig,
	baseDependencies: dependencies,
}: {
	authConfig: AuthConfig;
	baseDependencies: BaseDependencies;
}) => {
	const categoryService = categorySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'CATEGORY_CONTROLLER';
	return {
		getDetails: validateRequest(categoryDetailsRequestSchema, async (req, res, next) => {
			try {
				const categoryIdOrAlias = req.params.categoryId;

				logger.info(LOG_MODULE, 'Request Get Category Details', `categoryId '${categoryIdOrAlias}'`);

				const details = await categoryService.getDetails(categoryIdOrAlias);

				if (!details) {
					throw new NotFound(`Category '${categoryIdOrAlias}' not found`);
				}
				return res.send(details);
			} catch (error) {
				next(error);
			}
		}),
		listAll: async (req: Request, res: Response, next: NextFunction) => {
			try {
				logger.info(LOG_MODULE, `List All Categories request`);

				const categoryList = await categoryService.listAll();
				return res.send(categoryList);
			} catch (error) {
				next(error);
			}
		},
		assignAlias: validateRequest(categoryAliasAssignRequestSchema, async (req, res, next) => {
			try {
				// Access is decided before the category is looked up, so a refused request gets the same answer whether
				// or not the category exists.
				if (authConfig.enabled && !isUserAdmin(req.user)) {
					throw new Forbidden('Changing a category alias requires an administrator');
				}

				const categoryIdOrAlias = req.params.categoryId;
				const alias = req.body.alias;

				logger.info(LOG_MODULE, 'Request Assign Category Alias', `categoryId '${categoryIdOrAlias}'`);

				const result = await categoryService.assignAlias(categoryIdOrAlias, alias, req.user?.username);
				return res.send(result);
			} catch (error) {
				next(error);
			}
		}),
		unassignAlias: validateRequest(categoryAliasUnassignRequestSchema, async (req, res, next) => {
			try {
				if (authConfig.enabled && !isUserAdmin(req.user)) {
					throw new Forbidden('Changing a category alias requires an administrator');
				}

				const categoryIdOrAlias = req.params.categoryId;

				logger.info(LOG_MODULE, 'Request Unassign Category Alias', `categoryId '${categoryIdOrAlias}'`);

				const result = await categoryService.unassignAlias(categoryIdOrAlias, req.user?.username);
				return res.send(result);
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
