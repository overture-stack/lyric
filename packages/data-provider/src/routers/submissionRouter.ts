import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { type AuthConfig, BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = ({
	baseDependencies,
	authConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
}): Router => {
	const fileSizeLimit = getSizeInBytes(baseDependencies.limits.fileSize);
	const upload = multer({ dest: '/tmp', limits: { fileSize: fileSizeLimit } });

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

	router.post('/category/:categoryId/data', upload.array('files'), submissionController(baseDependencies).upload);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		submissionController(baseDependencies).deleteSubmittedDataBySystemId,
	);

	router.put(
		`/category/:categoryId/data`,
		upload.array('files'),
		submissionController(baseDependencies).editSubmittedData,
	);

	router.post('/category/:categoryId/commit/:submissionId', submissionController(baseDependencies).commit);

	return router;
};

export default router;
