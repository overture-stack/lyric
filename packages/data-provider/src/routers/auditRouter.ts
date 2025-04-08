import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import auditController from '../controllers/auditController.js';

const router = (baseDependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get(
		'/category/:categoryId/organization/:organization',
		auditController(baseDependencies).byCategoryIdAndOrganization,
	);
	return router;
};

export default router;
