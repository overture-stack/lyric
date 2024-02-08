import { Router } from 'express';

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

router.get('/', (_req, res) => res.send({ message: 'Pong' }));

export default router;
