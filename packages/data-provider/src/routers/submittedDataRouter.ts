import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';
import { auth } from '../middleware/auth.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));

	const fileSizeLimit = getSizeInBytes(dependencies.limits.fileSize);

	const upload = multer({ dest: '/tmp', limits: { fileSize: fileSizeLimit } });

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

	router.post(
		`/category/:categoryId/edit`,
		auth,
		upload.array('files'),
		submittedDataController(dependencies).editSubmittedData,
	);

	return router;
};

export default router;
