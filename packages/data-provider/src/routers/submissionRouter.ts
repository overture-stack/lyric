import { json, Router, urlencoded } from 'express';

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
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.use(authMiddleware(authConfig));

	router.get(
		'/:submissionId/summary',
		submissionController({
			baseDependencies,
			authConfig,
		}).getSubmissionSummaryById,
	);

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
