import { Router } from 'express';

import { auth } from '../middleware/auth.js';

import { Dependencies } from '../config/config.js';
import { dictionaryControllers } from '../controllers/dictionaryController.js';

export const dictionaryRouters = (dependencies: Dependencies) => {
	const router = Router();
	/**
	 * @swagger
	 * /dictionary/register:
	 *   post:
	 *     summary: Register new dictionary
	 *     tags:
	 *       - dictionary
	 *     parameters:
	 *       - name: categoryName
	 *         in: formData
	 *         type: string
	 *         required: true
	 *       - name: dictionaryName
	 *         in: formData
	 *         type: string
	 *         required: true
	 *       - name: version
	 *         in: formData
	 *         type: string
	 *         required: true
	 *     responses:
	 *       200:
	 *         description: Dictionary info
	 */
	router.post('/register', auth, dictionaryControllers(dependencies).registerDictionary);
	return router;
};
