import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import validationController from '../controllers/validationController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';

const router = ({
	baseDependencies,
	authConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
}): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.use(authMiddleware(authConfig));

	router.get('/validator/:categoryId/entity/:entityName', validationController(baseDependencies).validateRecord);

	return router;
};

export default router;
