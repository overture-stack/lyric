import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
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

	router.use(authMiddleware(authConfig));

	router.get('/:submissionId', submissionController(baseDependencies).getSubmissionById);

	router.delete('/:submissionId', submissionController(baseDependencies).delete);

	router.delete('/:submissionId/:actionType', submissionController(baseDependencies).deleteEntityName);

	router.get('/category/:categoryId', submissionController(baseDependencies).getSubmissionsByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		submissionController(baseDependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/data', submissionController(baseDependencies).submit);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		submissionController(baseDependencies).deleteSubmittedDataBySystemId,
	);

	router.put(`/category/:categoryId/data`, submissionController(baseDependencies).editSubmittedData);

	router.post('/category/:categoryId/commit/:submissionId', submissionController(baseDependencies).commit);

	return router;
};

export default router;
