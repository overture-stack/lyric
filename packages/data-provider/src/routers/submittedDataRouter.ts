import { Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));

	router.get('/category/:categoryId', auth, submittedDataController(dependencies).getSubmittedDataByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submittedDataController(dependencies).getSubmittedDataByOrganization,
	);

	router.post(
		'/category/:categoryId/organization/:organization/query',
		auth,
		submittedDataController(dependencies).getSubmittedDataByQuery,
	);

	return router;
};

export default router;
