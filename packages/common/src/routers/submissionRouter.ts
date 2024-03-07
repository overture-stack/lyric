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

	/**
	 * @swagger
	 * /submission/category/{categoryId}:
	 *   get:
	 *     summary: Get active submission for a category
	 *     tags:
	 *       - submission
	 *     parameters:
	 *       - name: categoryId
	 *         in: path
	 *         type: string
	 *         required: true
	 *     responses:
	 *       201:
	 *         description: Submission accepted
	 *       401:
	 *         $ref: '#/components/responses/UnauthorizedError'
	 */
	router.get('/category/:categoryId', auth, submissionControllers(dependencies).listActive);

	/**
	 * @swagger
	 * /submission/category/{categoryId}/upload:
	 *   post:
	 *     summary: Upload submission files
	 *     tags:
	 *       - submission
	 *     consumes:
	 *       - multipart/form-data
	 *     parameters:
	 *       - name: files
	 *         in: formData
	 *         type: file
	 *         required: true
	 *         description: the tsv submission file
	 *       - name: categoryId
	 *         in: path
	 *         type: string
	 *         required: true
	 *     responses:
	 *       201:
	 *         description: Submission accepted
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CreateSubmissionResult'
	 *       401:
	 *         $ref: '#/components/responses/UnauthorizedError'
	 *       422:
	 *         description: Submission failed
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CreateSubmissionResult'
	 *       500:
	 *         $ref: '#/components/responses/ServerError'
	 *       503:
	 *         $ref: '#/components/responses/ServiceUnavailableError'
	 */
	router.post('/category/:categoryId/upload', upload.array('files'), submissionControllers(dependencies).upload);

	/**
	 * @swagger
	 * /submission/category/{categoryId}/commit/{id}:
	 *   post:
	 *     summary: Commit Active Submission
	 *     tags:
	 *       - submission
	 *     parameters:
	 *       - name: categoryId
	 *         in: path
	 *         type: file
	 *         required: true
	 *       - name: id
	 *         in: path
	 *         type: string
	 *         required: true
	 *     responses:
	 *       200:
	 *         description: Submission accepted
	 *       401:
	 *         $ref: '#/components/responses/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/responses/ServerError'
	 *       503:
	 *         $ref: '#/components/responses/ServiceUnavailableError'
	 */
	router.post('/category/:categoryId/commit/:id', auth, submissionControllers(dependencies).commit);
	return router;
};

export default router;
