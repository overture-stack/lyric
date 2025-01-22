import { json, Router, urlencoded } from 'express';

import { type AuthConfig, BaseDependencies } from '../config/config.js';
import dictionaryController from '../controllers/dictionaryController.js';
import { authMiddleware } from '../middleware/auth.js';

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

	router.post('/register', dictionaryController(baseDependencies).registerDictionary);
	return router;
};

export default router;
