import express, { type Router } from 'express';
import supertest from 'supertest';

import { errorHandler } from '../../../src/middleware/errorHandler.js';

export function createTestApp(router: Router): supertest.Agent {
	const app = express();
	app.use(router);
	app.use(errorHandler);
	return supertest(app);
}
