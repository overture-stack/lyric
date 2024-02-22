import { Router } from 'express';

import { auth } from '../auth/middleware';

import { registerDictionary } from '../controllers/dictionaryController';

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

router.post('/register', auth, registerDictionary);

export { router as dictionaryRouter };
