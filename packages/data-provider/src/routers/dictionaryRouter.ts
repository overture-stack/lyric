import { json, Router, urlencoded } from 'express';

import { BaseDependencies } from '../config/config.js';
import dictionaryController from '../controllers/dictionaryController.js';
import { auth } from '../middleware/auth.js';

const router = (dependencies: BaseDependencies): Router => {
	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.post('/register', auth, dictionaryController(dependencies).registerDictionary);
	return router;
};

export default router;
