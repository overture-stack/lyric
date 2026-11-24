import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';
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

	// Alias changes authenticate on every method, regardless of `protectedMethods`, since an alias addresses a category
	// across every organization.
	router.put(
		'/:categoryId/alias',
		authenticateEveryMethod,
		categoryController({ authConfig, baseDependencies }).assignAlias,
	);
	router.delete(
		'/:categoryId/alias',
		authenticateEveryMethod,
		categoryController({ authConfig, baseDependencies }).unassignAlias,
	);

	router.get('/', defaultAuthenticator, categoryController({ authConfig, baseDependencies }).listAll);
	router.get('/:categoryId', defaultAuthenticator, categoryController({ authConfig, baseDependencies }).getDetails);

	return router;
};

export default router;
