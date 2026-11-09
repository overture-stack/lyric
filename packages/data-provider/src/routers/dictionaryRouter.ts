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

	// Authenticates on every method, regardless of `protectedMethods`, since a category's dictionary governs every
	// organization's submissions. It sits ahead of the router-wide auth middleware so a request is authenticated once.
	router.post(
		'/register',
		authMiddleware({ ...authConfig, protectedMethods: undefined }),
		dictionaryController({ authConfig, baseDependencies }).registerDictionary,
	);

	router.use(authMiddleware(authConfig));

	router.get('/category/:categoryId', dictionaryController({ authConfig, baseDependencies }).getDictionaryJson);
	router.get(
		'/category/:categoryId/templates',
		dictionaryController({ authConfig, baseDependencies }).downloadDataFileTemplates,
	);
	return router;
};

export default router;
