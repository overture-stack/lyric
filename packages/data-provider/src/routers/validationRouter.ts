import { json, Router, urlencoded } from 'express';

import { BaseDependencies, type ValidatorConfig } from '../config/config.js';
import validationController from '../controllers/validationController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';
import { actionLoggerMiddleware } from '../middleware/actionLogger.js';

const router = ({
	baseDependencies,
	authConfig,
	validatorConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
	validatorConfig: ValidatorConfig;
}): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.use(authMiddleware(authConfig));
	router.use(actionLoggerMiddleware({ enabled: authConfig.enabled }, baseDependencies.logger));

	router.get(
		'/category/:categoryId/entity/:entityName/exists',
		validationController({ baseDependencies, validatorConfig }).existsRecord,
	);

	return router;
};

export default router;
