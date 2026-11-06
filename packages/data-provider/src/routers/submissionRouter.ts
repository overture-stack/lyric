import { readFileSync } from 'node:fs';

import bytes from 'bytes';
import { json, type RequestHandler, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import createSubmissionController from '../controllers/submissionController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';
import { convertUploadErrors } from '../middleware/convertUploadErrors.js';
import { limitRequestSize } from '../middleware/limitRequestSize.js';
import { ContentTooLarge } from '../utils/errors.js';
import { getSubmissionBodyLimits } from '../utils/submissionLimits.js';

/**
 * Creates the submission router. It authenticates a request before it parses the body, and refuses:
 * - a file or a JSON body over `maxFileSize` with `ContentTooLarge` (413), naming the limit;
 * - any other upload refused by multer with `ContentTooLarge` (413) for one of its limits, or `BadRequest` (400);
 * - with `maxRequestSize` set, an upload over it with `ContentTooLarge` (413), one without `Content-Length` with
 *   `LengthRequired` (411), and one whose `Content-Length` is not a whole number of bytes with `BadRequest` (400).
 */
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

	const { fileSize, jsonSize, requestSize } = getSubmissionBodyLimits(baseDependencies.submissionService);

	/**
	 * Multer multipart form upload processor. Returns middleware that can capture uploaded files and make them
	 * available at `req.files`.
	 */
	const upload = multer({ dest: '/tmp', limits: { fileSize } });

	/**
	 * Runs the upload processor, answering a file over the size limit with `ContentTooLarge` naming the limit, so the
	 * submitter knows how far to shrink or split the file.
	 */
	const uploadFiles: RequestHandler = (req, res, next) => {
		upload.any()(req, res, (error?: unknown) => {
			if (fileSize && error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
				return next(new ContentTooLarge(`Each file must be at most ${bytes.format(fileSize)}`));
			}
			return next(error);
		});
	};

	const uploadSizeLimit: RequestHandler[] = requestSize ? [limitRequestSize(requestSize)] : [];

	const parseJson = json({ limit: jsonSize });

	/**
	 * Parses a JSON body, answering one over the size limit with `ContentTooLarge` naming the limit.
	 */
	const parseJsonBody: RequestHandler = (req, res, next) => {
		parseJson(req, res, (error?: unknown) => {
			if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
				return next(new ContentTooLarge(`JSON request bodies must be at most ${bytes.format(jsonSize)}`));
			}
			return next(error);
		});
	};

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

	const router = Router();

	// Authenticates each request that requires it. A request that fails is handed to the error handler, so nothing
	// below runs for it.
	router.use(authMiddleware(authConfig));

	// Keep authentication above the body parsers. Parsing holds the whole body in memory, so it runs only for a request
	// that has passed authentication or needs none.

	// Parses a URL-encoded form body into `req.body`
	router.use(urlencoded({ extended: false }));
	// Parses a JSON body into `req.body`
	router.use(parseJsonBody);

	router.get('/:submissionId', submissionController.getSubmissionById);

	router.delete('/:submissionId', submissionController.delete);

	router.get('/:submissionId/data', submissionController.getSubmissionDetailsById);

	router.delete('/:submissionId/data', submissionController.deleteByFileId);

	router.get('/category/:categoryId', submissionController.getSubmissionsByCategory);

	router.get('/category/:categoryId/organization/:organization', submissionController.getActiveByOrganization);

	router.post('/category/:categoryId/data', submissionController.submit);

	router.put(`/category/:categoryId/data`, submissionController.editSubmittedData);

	router.post(
		'/category/:categoryId/files',
		...uploadSizeLimit,
		uploadFiles,
		convertUploadErrors,
		extractFileEntityMap,
		submissionController.submitFiles,
	);

	router.delete(`/category/:categoryId/data/:systemId`, submissionController.deleteSubmittedDataBySystemId);

	router.post('/category/:categoryId/commit/:submissionId', submissionController.commit);

	return router;
};

export default router;
