import { json, NextFunction, Request, Response, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';

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

	router.get('/', categoryController(dependencies).listAll);
	router.get('/:categoryId', categoryController(dependencies).getDetails);
	return router;
};

export default router;
