import { Router } from 'express';

import * as dictionaryController from '../controllers/dictionaryController';

const router = Router();

/**
 * @swagger
 * /dictionary:
 *   get:
 *     summary: Retrieve the current dictionary
 *     tags:
 *       - dictionary
 *     responses:
 *       200:
 *         description: Current dictionary
 */

router.get('/', dictionaryController.getCurrentDictionary);

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

router.post('/register', dictionaryController.registerDictionary);

export default router;
