import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.send({ message: 'Pong' }));

export default router;
