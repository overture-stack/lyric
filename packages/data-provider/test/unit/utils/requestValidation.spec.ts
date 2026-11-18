import { expect } from 'chai';
import express, { type RequestHandler } from 'express';
import { describe, it } from 'mocha';
import supertest from 'supertest';

import type { Logger } from '../../../src/config/logger.js';
import { createErrorHandler } from '../../../src/middleware/errorHandler.js';
import { validateRequest } from '../../../src/utils/requestValidation.js';
import {
	categoryDetailsRequestSchema,
	migrationDataRequestSchema,
	submissionDeleteRequestSchema,
} from '../../../src/utils/schemas.js';

const ignore = (): void => {};
const silentLogger: Logger = { debug: ignore, error: ignore, info: ignore, warn: ignore };

/**
 * Mounts a validated route whose handler echoes back the query and path params it receives, so a
 * test can see exactly what reaches a controller after validation.
 */
const createEchoApp = (path: string, handler: RequestHandler): supertest.Agent => {
	const app = express();
	app.get(path, handler);
	app.use(createErrorHandler({ logger: silentLogger }));
	return supertest(app);
};

const echo: Parameters<typeof validateRequest>[1] = (req, res) => {
	res.status(200).json({ params: req.params, query: req.query });
};

describe('validateRequest', () => {
	it('should pass the trimmed path param to the handler, not the raw one', async () => {
		const app = createEchoApp('/:categoryId', validateRequest(categoryDetailsRequestSchema, echo));

		const response = await app.get('/%201%20');

		expect(response.status).to.equal(200);
		expect(response.body.params).to.deep.equal({ categoryId: '1' });
	});

	it('should pass a lowercased boolean query param to the handler', async () => {
		const app = createEchoApp('/:submissionId', validateRequest(submissionDeleteRequestSchema, echo));

		const response = await app.get('/1?force=TRUE');

		expect(response.status).to.equal(200);
		expect(response.body.query).to.have.property('force', 'true');
	});

	it('should apply a query param default when the param is absent', async () => {
		const app = createEchoApp('/:submissionId', validateRequest(submissionDeleteRequestSchema, echo));

		const response = await app.get('/1');

		expect(response.status).to.equal(200);
		expect(response.body.query).to.have.property('force', 'false');
	});

	it('should leave migration records isInvalid unset when absent, so the records are not filtered by validity', async () => {
		const app = createEchoApp('/:migrationId/records', validateRequest(migrationDataRequestSchema, echo));

		const response = await app.get('/1/records');

		expect(response.status).to.equal(200);
		expect(response.body.query).to.not.have.property('isInvalid');
	});

	it('should strip query params the schema does not declare', async () => {
		const app = createEchoApp('/:submissionId', validateRequest(submissionDeleteRequestSchema, echo));

		const response = await app.get('/1?undeclared=value');

		expect(response.status).to.equal(200);
		expect(response.body.query).to.not.have.property('undeclared');
	});

	it('should answer 400 when validation fails, without reaching the handler', async () => {
		const app = createEchoApp('/:submissionId', validateRequest(submissionDeleteRequestSchema, echo));

		const response = await app.get('/1abc');

		expect(response.status).to.equal(400);
		expect(response.body.message).to.contain('submissionId');
	});
});
