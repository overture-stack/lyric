import { json, NextFunction, Request, Response, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import auditController from '../controllers/auditController.js';

const router = (
	dependencies: BaseDependencies,
	authMiddleware?: (req: Request, res: Response, next: NextFunction) => void,
): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	// If an auth middleware is provided, use it
	if (authMiddleware) {
		router.use(authMiddleware);
	}

	router.get(
		'/category/:categoryId/organization/:organization',
		auditController(dependencies).byCategoryIdAndOrganization,
	);
	return router;
};

export default router;
