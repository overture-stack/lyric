import { json, NextFunction, Request, Response, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import dictionaryController from '../controllers/dictionaryController.js';

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

	router.post('/register', dictionaryController(dependencies).registerDictionary);
	return router;
};

export default router;
