import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
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

	router.post('/register', authMiddleware(authConfig), dictionaryController(baseDependencies).registerDictionary);
	return router;
};

export default router;
