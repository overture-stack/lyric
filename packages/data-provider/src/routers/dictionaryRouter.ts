import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import dictionaryController from '../controllers/dictionaryController.js';
import { type AuthConfig, authMiddleware, authMiddlewareForEveryMethod } from '../middleware/auth.js';

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
	const authenticateEveryMethod = authMiddlewareForEveryMethod(authConfig);

	// Registering a dictionary authenticates on every method, regardless of `protectedMethods`, since a category's
	// dictionary governs every organization's submissions.
	router.post(
		'/register',
		authenticateEveryMethod,
		dictionaryController({ authConfig, baseDependencies }).registerDictionary,
	);

	router.get(
		'/category/:categoryId',
		defaultAuthenticator,
		dictionaryController({ authConfig, baseDependencies }).getDictionaryJson,
	);
	router.get(
		'/category/:categoryId/templates',
		defaultAuthenticator,
		dictionaryController({ authConfig, baseDependencies }).downloadDataFileTemplates,
	);
	return router;
};

export default router;
