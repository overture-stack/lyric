import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/:submissionId', auth, submissionController(dependencies).getSubmissionById);

	router.delete('/:submissionId', auth, submissionController(dependencies).delete);

	router.delete('/:submissionId/:actionType', auth, submissionController(dependencies).deleteEntityName);

	router.get('/category/:categoryId', auth, submissionController(dependencies).getSubmissionsByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submissionController(dependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/data', submissionController(dependencies).submit);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		auth,
		submissionController(dependencies).deleteSubmittedDataBySystemId,
	);

	router.put(`/category/:categoryId/data`, auth, submissionController(dependencies).editSubmittedData);

	router.post('/category/:categoryId/commit/:submissionId', auth, submissionController(dependencies).commit);

	return router;
};

export default router;
