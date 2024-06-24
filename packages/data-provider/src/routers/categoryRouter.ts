import { Router, json, urlencoded } from 'express';

import { auth } from '../middleware/auth.js';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/', auth, categoryController(dependencies).listAll);
	router.get('/:categoryId', auth, categoryController(dependencies).getDetails);
	return router;
};

export default router;
