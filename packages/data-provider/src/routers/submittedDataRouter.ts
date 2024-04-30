import { Router, json, urlencoded } from 'express';

import { auth } from '../middleware/auth.js';

import { Dependencies } from '../config/config.js';
import submittedDataController from '../controllers/submittedDataController.js';

const router = (dependencies: Dependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/category/:categoryId', auth, submittedDataController(dependencies).getSubmittedDataByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submittedDataController(dependencies).getSubmittedDataByOrganization,
	);

	return router;
};

export default router;
