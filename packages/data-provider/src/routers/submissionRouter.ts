import bytes from 'bytes';
import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import createSubmissionController from '../controllers/submissionController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';

const router = ({
	baseDependencies,
	authConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
}): Router => {
	const upload = multer({ dest: '/tmp', limits: { fileSize: baseDependencies.submissionService?.maxFileSize } });

	const submissionController = createSubmissionController({
		baseDependencies,
		authConfig,
	});

	// Handles null edgecase and values of 0 as no limit.
	const bytesFileLimit = bytes.format(baseDependencies.submissionService?.maxFileSize ?? 0) || undefined;

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(
		json({
			limit: bytesFileLimit,
		}),
	);

	router.use(authMiddleware(authConfig));

	router.get('/:submissionId', submissionController.getSubmissionById);

	router.get('/:submissionId/details', submissionController.getSubmissionDetailsById);

	router.delete('/:submissionId', submissionController.delete);

	router.delete('/:submissionId/:actionType', submissionController.deleteEntityName);

	router.get('/category/:categoryId', submissionController.getSubmissionsByCategory);

	router.get('/category/:categoryId/organization/:organization', submissionController.getActiveByOrganization);

	/* ===============================================================
	 * Submit Data
	 *   - Submit files for multiple entities
	 *   - Submit data for single entity (Files or request body text)
	 * =============================================================== */

	router.post('/category/:categoryId/data', submissionController.submit);

	router.put(`/category/:categoryId/data`, submissionController.editSubmittedData);

	router.post('/category/:categoryId/files', upload.array('files'), submissionController.submitFiles);

	router.delete(`/category/:categoryId/data/:systemId`, submissionController.deleteSubmittedDataBySystemId);

	router.post('/category/:categoryId/commit/:submissionId', submissionController.commit);

	return router;
};

export default router;
