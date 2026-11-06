import { expect } from 'chai';
import express, { type RequestHandler } from 'express';
import { describe, it } from 'mocha';
import multer from 'multer';
import supertest from 'supertest';

import type { Logger } from '../../../src/config/logger.js';
import { convertUploadErrors } from '../../../src/middleware/convertUploadErrors.js';
import { createErrorHandler } from '../../../src/middleware/errorHandler.js';
import { NotFound } from '../../../src/utils/errors.js';

const ignore = (): void => {};
const silentLogger: Logger = { debug: ignore, error: ignore, info: ignore, warn: ignore };

/**
 * Builds an app whose single POST route runs the given upload middleware and then responds 200, with
 * `convertUploadErrors` and Lyric's error handler mounted after it, as a consumer with its own upload route mounts them.
 */
const createApp = (upload: RequestHandler): supertest.Agent => {
	const app = express();
	app.post('/', upload, (_req, res) => {
		res.sendStatus(200);
	});
	app.use(convertUploadErrors);
	app.use(createErrorHandler({ logger: silentLogger }));
	return supertest(app);
};

const throwing =
	(error: unknown): RequestHandler =>
	() => {
		throw error;
	};

/**
 * Builds an error shaped like a `MulterError` from a copy of multer other than Lyric's own, as raised by a consumer
 * whose upload route depends on multer directly.
 */
const createForeignMulterError = (code: string): Error =>
	Object.assign(new Error('File too large'), { code, name: 'MulterError' });

describe('Upload error conversion', () => {
	it('should convert a file over the multer size limit into ContentTooLarge, answered 413', async () => {
		const uploadOneByteFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 } }).any();
		const response = await createApp(uploadOneByteFiles).post('/').attach('files', Buffer.from('12'), 'a.csv');
		expect(response.status).to.equal(413);
		expect(response.body).to.eql({ error: 'Content Too Large', message: 'File too large' });
	});

	it('should convert an upload over the multer count limit into ContentTooLarge, answered 413', async () => {
		const uploadOneFile = multer({ storage: multer.memoryStorage(), limits: { files: 1 } }).any();
		const response = await createApp(uploadOneFile)
			.post('/')
			.attach('files', Buffer.from('1'), 'a.csv')
			.attach('files', Buffer.from('2'), 'b.csv');
		expect(response.status).to.equal(413);
		expect(response.body).to.have.property('message', 'Too many files');
	});

	it('should convert any other upload refused by multer into BadRequest, answered 400', async () => {
		const uploadIntoOneField = multer({ storage: multer.memoryStorage() }).single('files');
		const response = await createApp(uploadIntoOneField).post('/').attach('other', Buffer.from('1'), 'a.csv');
		expect(response.status).to.equal(400);
		expect(response.body).to.eql({ error: 'Bad Request', message: 'Unexpected field' });
	});

	it('should convert an error raised by another copy of multer by its name and code', async () => {
		const tooLarge = await createApp(throwing(createForeignMulterError('LIMIT_FILE_SIZE'))).post('/');
		const unexpectedField = await createApp(throwing(createForeignMulterError('LIMIT_UNEXPECTED_FILE'))).post('/');
		expect(tooLarge.status).to.equal(413);
		expect(unexpectedField.status).to.equal(400);
	});

	it('should pass every other error on unchanged', async () => {
		const notFound = await createApp(throwing(new NotFound('Category not found'))).post('/');
		const plainError = await createApp(throwing(new Error('Unexpected'))).post('/');
		const thrownString = await createApp(throwing('connection lost')).post('/');
		expect(notFound.status).to.equal(404);
		expect(notFound.body).to.have.property('message', 'Category not found');
		expect(plainError.status).to.equal(500);
		expect(thrownString.status).to.equal(500);
	});
});
