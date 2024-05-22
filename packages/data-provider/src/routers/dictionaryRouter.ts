import { Router, json, urlencoded } from 'express';

import { auth } from '../middleware/auth.js';

import { BaseDependencies } from '../config/config.js';
import dictionaryControllers from '../controllers/dictionaryController.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.post('/register', auth, dictionaryControllers(dependencies).registerDictionary);
	return router;
};

export default router;
