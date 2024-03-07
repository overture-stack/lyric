import { Router } from 'express';

import pingController from '../controllers/pingController.js';

const router = Router();

router.get('/', pingController.ping);

export default router;
