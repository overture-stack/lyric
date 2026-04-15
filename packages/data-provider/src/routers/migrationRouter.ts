import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import migrationController from '../controllers/migrationController.js';
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

	router.get('/:migrationId', migrationController(baseDependencies).getMigrationById);

	router.get('/category/:categoryId', migrationController(baseDependencies).getMigrationsByCategoryId);

	return router;
};

export default router;
