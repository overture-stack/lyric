import { expect } from 'chai';
import express, { type RequestHandler } from 'express';
import { describe, it } from 'mocha';
import multer from 'multer';
import supertest from 'supertest';

import type { Logger } from '../../../src/config/logger.js';
import { createErrorHandler } from '../../../src/middleware/errorHandler.js';
import { limitRequestSize } from '../../../src/middleware/requestSize.js';

const ignore = (): void => {};
const silentLogger: Logger = { debug: ignore, error: ignore, info: ignore, warn: ignore };

/**
 * Builds an app whose single POST route runs the given middleware and then responds 200,
 * with Lyric's error handler mounted last as consumers mount it.
 */
const createApp = (...middleware: RequestHandler[]): supertest.Agent => {
	const app = express();
	app.post('/', ...middleware, (_req, res) => {
		res.sendStatus(200);
	});
	app.use(createErrorHandler({ logger: silentLogger }));
	return supertest(app);
};

describe('Request size limit', () => {
	it('should pass a request whose declared size is within the limit', async () => {
		const response = await createApp(limitRequestSize(1024)).post('/').send('a'.repeat(1024));
		expect(response.status).to.equal(200);
	});

	it('should respond 413 naming the limit when the declared size is over it', async () => {
		const response = await createApp(limitRequestSize(1024)).post('/').send('a'.repeat(1025));
		expect(response.status).to.equal(413);
		expect(response.body).to.have.property('message', 'Request content must be at most 1KB');
	});

	it('should count every file of an upload toward the limit', async () => {
		const uploadFilesUpTo1000Bytes = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1000 } }).any();
		const twoFilesUnderTheFileLimit = (request: supertest.Test): supertest.Test =>
			request.attach('files', Buffer.alloc(600), 'a.csv').attach('files', Buffer.alloc(600), 'b.csv');

		const withoutTotal = await twoFilesUnderTheFileLimit(createApp(uploadFilesUpTo1000Bytes).post('/'));
		const withTotal = await twoFilesUnderTheFileLimit(
			createApp(limitRequestSize(1024), uploadFilesUpTo1000Bytes).post('/'),
		);

		expect(withoutTotal.status).to.equal(200);
		expect(withTotal.status).to.equal(413);
	});

	it('should respond 411 to a body sent without a declared size', async () => {
		const request = createApp(limitRequestSize(1024)).post('/');
		request.write('a');
		const response = await request;
		expect(response.status).to.equal(411);
	});

	it('should pass a request with no body', async () => {
		const response = await createApp(limitRequestSize(1024)).post('/');
		expect(response.status).to.equal(200);
	});
});
