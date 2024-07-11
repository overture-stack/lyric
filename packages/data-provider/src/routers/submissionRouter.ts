import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { auth } from '../middleware/auth.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = (dependencies: BaseDependencies): Router => {
	const fileSizeLimit = getSizeInBytes(dependencies.limits.fileSize);
	const upload = multer({ dest: '/tmp', limits: { fileSize: fileSizeLimit } });

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/:submissionId', auth, submissionController(dependencies).getActiveById);

	router.delete('/:submissionId', auth, submissionController(dependencies).delete);

	router.delete('/:submissionId/:entityName', auth, submissionController(dependencies).deleteEntityName);

	router.get('/category/:categoryId', auth, submissionController(dependencies).getActiveByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submissionController(dependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/upload', upload.array('files'), submissionController(dependencies).upload);

	router.post('/category/:categoryId/commit/:submissionId', auth, submissionController(dependencies).commit);

	return router;
};

export default router;
