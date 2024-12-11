import { json, NextFunction, Request, Response, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';

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

	router.get('/category/:categoryId', submittedDataController(dependencies).getSubmittedDataByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		submittedDataController(dependencies).getSubmittedDataByOrganization,
	);

	router.post(
		'/category/:categoryId/organization/:organization/query',
		submittedDataController(dependencies).getSubmittedDataByQuery,
	);

	router.get('/category/:categoryId/id/:systemId', submittedDataController(dependencies).getSubmittedDataBySystemId);

	return router;
};

export default router;
