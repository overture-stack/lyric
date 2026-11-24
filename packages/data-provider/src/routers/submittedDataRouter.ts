import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';
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

	const defaultAuthenticator = authMiddleware(authConfig);

	router.get(
		'/category/:categoryId',
		defaultAuthenticator,
		submittedDataController({ baseDependencies, authConfig }).getSubmittedDataByCategory,
	);

	router.get(
		'/category/:categoryId/organization/:organization',
		defaultAuthenticator,
		submittedDataController({ baseDependencies, authConfig }).getSubmittedDataByOrganization,
	);

	router.post(
		'/category/:categoryId/organization/:organization/query',
		defaultAuthenticator,
		submittedDataController({ baseDependencies, authConfig }).getSubmittedDataByQuery,
	);

	router.get(
		'/category/:categoryId/id/:systemId',
		defaultAuthenticator,
		submittedDataController({ baseDependencies, authConfig }).getSubmittedDataBySystemId,
	);
	router.get(
		'/category/:categoryId/stream',
		defaultAuthenticator,
		submittedDataController({ baseDependencies, authConfig }).getSubmittedDataByCategoryStream,
	);

	return router;
};

export default router;
