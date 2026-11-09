import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';
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

	// Each authenticates on every method, regardless of `protectedMethods`, since an alias addresses a category across
	// every organization. They sit ahead of the router-wide auth middleware so a request is authenticated once.
	const authenticateEveryMethod = authMiddleware({ ...authConfig, protectedMethods: undefined });
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

	router.use(authMiddleware(authConfig));

	router.get('/', categoryController({ authConfig, baseDependencies }).listAll);
	router.get('/:categoryId', categoryController({ authConfig, baseDependencies }).getDetails);

	return router;
};

export default router;
