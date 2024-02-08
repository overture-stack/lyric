import { Router } from 'express';

import { getCurrentDictionary } from '../service/dictionary';

const router = Router();

router.get('/', async (_req, res) => {
	const currentDictionary = await getCurrentDictionary();
	res.send(currentDictionary);
});

export default router;
