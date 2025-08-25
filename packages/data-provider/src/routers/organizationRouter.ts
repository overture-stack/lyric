import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import organizationController from '../controllers/organizationController.js';
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

	router.post('/', organizationController(baseDependencies).registerOrganization);
	router.delete('/:id', organizationController(baseDependencies).deleteOrganization);

	return router;
};

export default router;
