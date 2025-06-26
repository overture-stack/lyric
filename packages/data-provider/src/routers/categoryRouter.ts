import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';
import dictionaryController from '../controllers/dictionaryController.js';
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

	router.get('/', categoryController(baseDependencies).listAll);
	router.get('/:categoryId', categoryController(baseDependencies).getDetails);

	router.get('/:categoryId', dictionaryController(baseDependencies).getDictionaryJson);
	router.get('/:categoryId/templates', dictionaryController(baseDependencies).downloadDataFileTemplates);
	return router;
};

export default router;
