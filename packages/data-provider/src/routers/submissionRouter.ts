import { readFileSync } from 'node:fs';

import bytes from 'bytes';
import { json, type RequestHandler, Router, urlencoded } from 'express';
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
	/* ======================= *
	 * Local Router Middleware *
	 * ======================= */

	/**
	 * Multer multipart form upload processor. Returns middleware that can capture uploaded files and make them
	 * available at `req.files`.
	 */
	const upload = multer({ dest: '/tmp', limits: { fileSize: baseDependencies.submissionService?.maxFileSize } });
	/**
	 * File upload is done via a multi-part form. This form data includes both "files" and optionally a "fileEntityMap".
	 * This middleware moves the content of the fileEntityMap out of the req.files property and into the req.body value
	 * for the validation middleware to handle.
	 * @param req
	 * @param _res
	 * @param next
	 */
	const extractFileEntityMap: RequestHandler = (req, _res, next) => {
		if (Array.isArray(req.files)) {
			const mapPart = Array.isArray(req.files)
				? req.files.find((file) => file.fieldname === 'fileEntityMap')
				: undefined;
			if (mapPart) {
				try {
					const fileReadOutput = readFileSync(mapPart.path, 'utf-8');
					req.body = fileReadOutput;
				} catch {
					// Could not read the fileEntityMap part - proceed without it
				}
				req.files = req.files.filter((file) => file.fieldname === 'files');
			}
		}

		next();
	};

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

	router.post('/category/:categoryId/data', submissionController.submit);

	router.put(`/category/:categoryId/data`, submissionController.editSubmittedData);

	router.post('/category/:categoryId/files', upload.any(), extractFileEntityMap, submissionController.submitFiles);

	router.delete(`/category/:categoryId/data/:systemId`, submissionController.deleteSubmittedDataBySystemId);

	router.post('/category/:categoryId/commit/:submissionId', submissionController.commit);

	return router;
};

export default router;
