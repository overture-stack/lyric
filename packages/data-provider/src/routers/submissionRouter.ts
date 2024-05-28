import { Router, json, urlencoded } from 'express';
import multer from 'multer';

import { auth } from '../middleware/auth.js';

import { BaseDependencies } from '../config/config.js';
import submissionControllers from '../controllers/submissionController.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = (dependencies: BaseDependencies): Router => {
	const fileSizeLimit = getSizeInBytes(dependencies.limits.fileSize);
	const upload = multer({ dest: '/tmp', limits: { fileSize: fileSizeLimit } });

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/:submissionId', auth, submissionControllers(dependencies).getActiveById);

	router.delete('/:submissionId', auth, submissionControllers(dependencies).delete);

	router.get('/category/:categoryId', auth, submissionControllers(dependencies).getActiveByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submissionControllers(dependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/upload', upload.array('files'), submissionControllers(dependencies).upload);

	router.post('/category/:categoryId/commit/:submissionId', auth, submissionControllers(dependencies).commit);

	return router;
};

export default router;
