import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import categoryController from '../controllers/categoryController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/', auth, categoryController(dependencies).listAll);
	router.get('/:categoryId', auth, categoryController(dependencies).getDetails);
	return router;
};

export default router;
