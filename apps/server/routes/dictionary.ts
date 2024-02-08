import { Router } from 'express';

import { getCurrentDictionary } from '../service/dictionary';

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

router.get('/', async (_req, res) => {
	const currentDictionary = await getCurrentDictionary();
	res.send(currentDictionary);
});

export default router;
