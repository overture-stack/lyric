import express, { type Router } from 'express';
import supertest from 'supertest';

export function createTestApp(router: Router): supertest.Agent {
	const app = express();
	app.use(router);
	return supertest(app);
}
