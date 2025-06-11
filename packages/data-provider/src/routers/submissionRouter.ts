import { json, Router, urlencoded } from 'express';
import multer from 'multer';

import { BaseDependencies, FilesConfig } from '../config/config.js';
import submissionController from '../controllers/submissionController.js';
import { type AuthConfig, authMiddleware } from '../middleware/auth.js';
import { fileFilter } from '../middleware/fileFilter.js';
import { getSizeInBytes } from '../utils/files.js';

const router = ({
	baseDependencies,
	authConfig,
	filesConfig,
}: {
	baseDependencies: BaseDependencies;
	authConfig: AuthConfig;
	filesConfig: FilesConfig;
}): Router => {
	const fileSizeLimit = getSizeInBytes(filesConfig.limitSize);
	const upload = multer({
		dest: '/tmp',
		limits: { fileSize: fileSizeLimit },
		fileFilter,
	});
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.use(authMiddleware(authConfig));

	router.get(
		'/:submissionId',
		submissionController({
			baseDependencies,
			authConfig,
		}).getSubmissionById,
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

	router.post(
		'/category/:categoryId/data',
		upload.array('files'),
		submissionController({
			baseDependencies,
			authConfig,
		}).submit,
	);

	router.delete(
		`/category/:categoryId/data/:systemId`,
		submissionController({
			baseDependencies,
			authConfig,
		}).deleteSubmittedDataBySystemId,
	);

	router.put(
		`/category/:categoryId/data`,
		upload.array('files'),
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
