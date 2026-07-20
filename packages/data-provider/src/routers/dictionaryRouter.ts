import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import dictionaryController from '../controllers/dictionaryController.js';
import { actionLoggerMiddleware } from '../middleware/actionLogger.js';
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

	router.use(actionLoggerMiddleware({ enabled: baseDependencies.routerLoggerEnabled }, baseDependencies.logger));
	router.use(authMiddleware(authConfig));

	router.post('/register', dictionaryController(baseDependencies).registerDictionary);

	router.get('/category/:categoryId', dictionaryController(baseDependencies).getDictionaryJson);
	router.get('/category/:categoryId/templates', dictionaryController(baseDependencies).downloadDataFileTemplates);
	return router;
};

export default router;
