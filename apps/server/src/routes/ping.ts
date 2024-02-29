import { Router } from 'express';

import pingController from '../controllers/pingController.js';

const router = Router();

/**
 * @swagger
 * /ping:
 *   get:
 *     summary: Status of the service
 *     tags:
 *       - ping
 *     responses:
 *       200:
 *         description: Status
 */

router.get('/', pingController.ping);

export default router;
