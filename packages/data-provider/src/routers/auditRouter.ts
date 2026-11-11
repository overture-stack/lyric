import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import auditController from '../controllers/auditController.js';
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

	const defaultAuthenticator = authMiddleware(authConfig);

	router.get(
		'/category/:categoryId/organization/:organization',
		defaultAuthenticator,
		auditController(baseDependencies).byCategoryIdAndOrganization,
	);
	return router;
};

export default router;
