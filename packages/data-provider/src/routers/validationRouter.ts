import { json, Router, urlencoded } from 'express';

import { BaseDependencies, type ValidatorConfig } from '../config/config.js';
import validationController from '../controllers/validationController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';

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

	router.get('/:categoryId/:entityName', validationController({ baseDependencies, validatorConfig }).validateRecord);

	return router;
};

export default router;
