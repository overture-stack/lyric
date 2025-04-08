import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';

const router = (baseDependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/', categoryController(baseDependencies).listAll);
	router.get('/:categoryId', categoryController(baseDependencies).getDetails);
	return router;
};

export default router;
