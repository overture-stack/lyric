import { Router, json, urlencoded } from 'express';
import multer from 'multer';

import { auth } from '../middleware/auth.js';

import { Dependencies } from '../config/config.js';
import submissionControllers from '../controllers/submissionController.js';
import { validateRequest } from '../middleware/requestValidation.js';
import {
	activeSubmissionRequestSchema,
	commitSubmissionRequestSchema,
	uploadSubmissionBodyRequestSchema,
	uploadSubmissionFileRequestSchema,
	uploadSubmissionPathParamsRequestSchema,
} from '../utils/schemas.js';

const router = (dependencies: Dependencies): Router => {
	const upload = multer({ dest: '/tmp' });

	const router = Router();
	router.use(urlencoded({ extended: false }));
	router.use(json());

	router.get(
		'/category/:categoryId',
		auth,
		validateRequest({ pathParams: activeSubmissionRequestSchema }),
		submissionControllers(dependencies).listActive,
	);

	router.post(
		'/category/:categoryId/upload',
		upload.array('files'),
		validateRequest({
			body: uploadSubmissionBodyRequestSchema,
			files: uploadSubmissionFileRequestSchema,
			pathParams: uploadSubmissionPathParamsRequestSchema,
		}),
		submissionControllers(dependencies).upload,
	);

	router.post(
		'/category/:categoryId/commit/:id',
		auth,
		validateRequest({ pathParams: commitSubmissionRequestSchema }),
		submissionControllers(dependencies).commit,
	);
	return router;
};

export default router;
