import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';
import { auth } from '../middleware/auth.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));

	const fileSizeLimit = getSizeInBytes(dependencies.limits.fileSize);
	router.use(json({ limit: fileSizeLimit }));

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

	router.delete(`/:systemId`, auth, submittedDataController(dependencies).deleteSubmittedDataBySystemId);

	return router;
};

export default router;
