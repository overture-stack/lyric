import bytes from 'bytes';
import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';

const router = ({
	baseDependencies,
	authConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
}): Router => {
	const upload = multer({ dest: '/tmp', limits: { fileSize: baseDependencies.submissionService?.maxFileSize } });

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

	router.get(
		'/:submissionId',
		submissionController({
			baseDependencies,
			authConfig,
		}).getSubmissionById,
	);

	router.get(
		'/:submissionId/details',
		submissionController({
			baseDependencies,
			authConfig,
		}).getSubmissionDetailsById,
	);

	router.delete(
		'/:submissionId',
		submissionController({
			baseDependencies,
			authConfig,
		}).delete,
	);

	router.delete(
		'/:submissionId/:actionType',
		submissionController({
			baseDependencies,
			authConfig,
		}).deleteEntityName,
	);

	router.get(
		'/category/:categoryId',
		submissionController({
			baseDependencies,
			authConfig,
		}).getSubmissionsByCategory,
	);

	router.get(
		'/category/:categoryId/organization/:organization',
		submissionController({
			baseDependencies,
			authConfig,
		}).getActiveByOrganization,
	);

	/* ===============================================================
	 * Submit Data
	 *   - Submit files for multiple entities
	 *   - Submit data for single entity (Files or request body text)
	 * =============================================================== */

	router.post(
		'/category/:categoryId/organization/:organizationId',
		upload.array('files'),
		submissionController({
			baseDependencies,
			authConfig,
		}).submitFiles,
	);

	router.post(
		'/category/:categoryId/organization/:organizationId/entity/:entityName',
		upload.array('files'),
		submissionController({
			baseDependencies,
			authConfig,
		}).submitSingleEntityData,
	);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		submissionController({
			baseDependencies,
			authConfig,
		}).deleteSubmittedDataBySystemId,
	);

	router.put(
		`/category/:categoryId/organization/:organizationId/entity/:entityName`,
		submissionController({
			baseDependencies,
			authConfig,
		}).editSubmittedData,
	);

	router.post(
		'/category/:categoryId/commit/:submissionId',
		submissionController({
			baseDependencies,
			authConfig,
		}).commit,
	);

	return router;
};

export default router;
