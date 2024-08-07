import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import auditController from '../controllers/auditController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		auditController(dependencies).byCategoryIdAndOrganization,
	);
	return router;
};

export default router;
