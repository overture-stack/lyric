import { Router, json, urlencoded } from 'express';
import multer from 'multer';

import { auth } from '../middleware/auth.js';

import { Dependencies } from '../config/config.js';
import submissionControllers from '../controllers/submissionController.js';

const router = (dependencies: Dependencies): Router => {
	const upload = multer({ dest: '/tmp' });

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get('/:submissionId', auth, submissionControllers(dependencies).getActiveById);

	router.get('/category/:categoryId', auth, submissionControllers(dependencies).getActiveByCategory);

	router.get(
		'/category/:categoryId/organization/:organization',
		auth,
		submissionControllers(dependencies).getActiveByOrganization,
	);

	router.post('/category/:categoryId/upload', upload.array('files'), submissionControllers(dependencies).upload);

	router.post('/category/:categoryId/commit/:id', auth, submissionControllers(dependencies).commit);
	return router;
};

export default router;
