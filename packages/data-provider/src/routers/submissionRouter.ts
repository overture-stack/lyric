import { json, NextFunction, Request, Response, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { getSizeInBytes } from '../utils/fileUtils.js';

const router = (
	dependencies: BaseDependencies,
	authMiddleware?: (req: Request, res: Response, next: NextFunction) => void,
): Router => {
	const fileSizeLimit = getSizeInBytes(dependencies.limits.fileSize);
	const upload = multer({ dest: '/tmp', limits: { fileSize: fileSizeLimit } });

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	// If an auth middleware is provided, use it
	if (authMiddleware) {
		router.use(authMiddleware);
	}

	router.get('/:submissionId', submissionController(dependencies).getActiveById);

	router.delete('/:submissionId', submissionController(dependencies).delete);

	router.delete('/:submissionId/:actionType', submissionController(dependencies).deleteEntityName);

	router.get('/category/:categoryId', submissionController(dependencies).getActiveByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		submissionController(dependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/data', upload.array('files'), submissionController(dependencies).upload);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		submissionController(dependencies).deleteSubmittedDataBySystemId,
	);

	router.put(`/category/:categoryId/data`, upload.array('files'), submissionController(dependencies).editSubmittedData);

	router.post('/category/:categoryId/commit/:submissionId', submissionController(dependencies).commit);

	return router;
};

export default router;
