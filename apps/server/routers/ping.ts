import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.send({ message: 'Ping' }));

export default router;
