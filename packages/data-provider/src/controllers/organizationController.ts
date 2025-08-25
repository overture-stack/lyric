import type { NextFunction, Request, Response } from 'express';

import { BaseDependencies } from '../config/config.js';
import organizationSvc from '../services/organizationService.js';
import { NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { registerOrganizationSchema, deleteOrganizationSchema } from '../utils/schemas.js';
import { Organization } from '@overture-stack/lyric-data-model/models';

const controller = (dependencies: BaseDependencies) => {
	const organizationService = organizationSvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'ORGANIZATION_CONTROLLER';

	return {
		/**
		 * Registers a new organization if it does not exist
		 */
		registerOrganization: validateRequest(
			registerOrganizationSchema,
			async (req: Request, res: Response, next: NextFunction) => {
				try {
					const { name } = req.body;

					logger.info(LOG_MODULE, `Register Organization request name='${name}'`);

					const organization: Organization = await organizationService.registerOrganization(name);

					return res.status(200).send(organization);
				} catch (error) {
					logger.error(LOG_MODULE, 'Error registering organization', error);
					next(error);
				}
			},
		),

		/**
		 * Deletes an organization by ID
		 */
		deleteOrganization: validateRequest(
			deleteOrganizationSchema,
			async (req: Request, res: Response, next: NextFunction) => {
				try {
					const orgId = Number(req.params.id);

					logger.info(LOG_MODULE, `Delete Organization request id='${orgId}'`);

					const deleted = await organizationService.deleteOrganization(orgId);

					if (!deleted) {
						throw new NotFound(`Organization with ID '${orgId}' not found`);
					}

					return res.status(200).send({ success: true, id: orgId });
				} catch (error) {
					logger.error(LOG_MODULE, 'Error deleting organization', error);
					next(error);
				}
			},
		),
	};
};

export default controller;
