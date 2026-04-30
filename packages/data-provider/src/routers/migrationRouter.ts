import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import createMigrationController from '../controllers/migrationController.js';
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

	const migrationController = createMigrationController(baseDependencies);

	router.get('/:migrationId', migrationController.getMigrationById);

	router.get('/category/:categoryId', migrationController.getMigrationsByCategoryId);

	router.get('/:migrationId/records', migrationController.getMigrationRecords);

	return router;
};

export default router;
