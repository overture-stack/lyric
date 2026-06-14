import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';
import { actionLoggerMiddleware } from '../middleware/actionLogger.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';

// REMEMBER, all of the endpoints in clinical are custom and go straight to lyrics controller, so it will not pass through the router,
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

	router.use(actionLoggerMiddleware({ enabled: baseDependencies.disableLogger }, baseDependencies.logger));
	router.use(authMiddleware(authConfig));

	router.get('/', categoryController(baseDependencies).listAll);
	router.get('/:categoryId', categoryController(baseDependencies).getDetails);

	return router;
};

export default router;
