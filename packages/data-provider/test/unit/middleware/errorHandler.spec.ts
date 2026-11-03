import { expect } from 'chai';
import express, { type ErrorRequestHandler, json, type RequestHandler } from 'express';
import { describe, it } from 'mocha';
import multer from 'multer';
import supertest from 'supertest';

import type { Logger } from '../../../src/config/logger.js';
import { createErrorHandler, errorHandler, type ErrorResponse } from '../../../src/middleware/errorHandler.js';
import {
	BadRequest,
	ContentTooLarge,
	InternalServerError,
	LengthRequired,
	NotFound,
	ServiceUnavailable,
} from '../../../src/utils/errors.js';

/**
 * Builds an app whose single POST route runs the given middleware and then responds 200,
 * with the given error handler mounted last as consumers mount it.
 */
const createAppWithHandler = (handler: ErrorRequestHandler, ...middleware: RequestHandler[]): supertest.Agent => {
	const app = express();
	app.post('/', ...middleware, (_req, res) => {
		res.sendStatus(200);
	});
	app.use(handler);
	return supertest(app);
};

const ignore = (): void => {};
const silentLogger: Logger = { debug: ignore, error: ignore, info: ignore, warn: ignore };

const createApp = (...middleware: RequestHandler[]): supertest.Agent =>
	createAppWithHandler(createErrorHandler({ logger: silentLogger }), ...middleware);

/** A logger that keeps the arguments of every `error` call, so a test can check what was logged. */
const createRecordingLogger = (): { errors: unknown[][]; logger: Logger } => {
	const errors: unknown[][] = [];
	const logger: Logger = {
		debug: ignore,
		error: (...messages: unknown[]) => {
			errors.push(messages);
		},
		info: ignore,
		warn: ignore,
	};
	return { errors, logger };
};

const throwing =
	(error: Error): RequestHandler =>
	() => {
		throw error;
	};

/**
 * Builds an error shaped like a `MulterError` from a copy of multer other than Lyric's own, as raised by a
 * consumer that runs its own multer in front of Lyric's `errorHandler`.
 */
const createForeignMulterError = (code: string): Error =>
	Object.assign(new Error('File too large'), { code, name: 'MulterError' });

describe('Error handler', () => {
	describe('Lyric error types', () => {
		it('should respond with the status mapped to a Lyric error type', async () => {
			const response = await createApp(throwing(new NotFound('Category not found'))).post('/');
			expect(response.status).to.equal(404);
			expect(response.body).to.eql({ error: 'Not Found', message: 'Category not found' });
		});

		it('should respond 413 to ContentTooLarge', async () => {
			const response = await createApp(throwing(new ContentTooLarge('Each file must be at most 10MB'))).post('/');
			expect(response.status).to.equal(413);
			expect(response.body).to.have.property('message', 'Each file must be at most 10MB');
		});

		it('should respond 411 to LengthRequired', async () => {
			const response = await createApp(throwing(new LengthRequired())).post('/');
			expect(response.status).to.equal(411);
		});

		it('should respond with the message Lyric gave its own InternalServerError', async () => {
			const response = await createApp(throwing(new InternalServerError('Failed to build the compound view'))).post(
				'/',
			);
			expect(response.status).to.equal(500);
			expect(response.body).to.have.property('message', 'Failed to build the compound view');
		});

		it('should respond the same way when mounted as the default errorHandler', async () => {
			const response = await createAppWithHandler(errorHandler, throwing(new NotFound('Category not found'))).post('/');
			expect(response.status).to.equal(404);
			expect(response.body).to.eql({ error: 'Not Found', message: 'Category not found' });
		});

		it('should include the error details in the response body', async () => {
			const response = await createApp(throwing(new BadRequest('Invalid request', { field: 'name' }))).post('/');
			expect(response.status).to.equal(400);
			expect(response.body).to.have.deep.property('details', { field: 'name' });
		});
	});

	describe('Upload errors', () => {
		const uploadOneByteFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 } }).any();
		const uploadIntoOneField = multer({ storage: multer.memoryStorage() }).single('files');

		it('should respond 413 when an uploaded file exceeds the size limit', async () => {
			const response = await createApp(uploadOneByteFiles).post('/').attach('files', Buffer.from('12'), 'a.csv');
			expect(response.status).to.equal(413);
			expect(response.body).to.have.property('error', 'MulterError');
			expect(response.body).to.have.property('message', 'File too large');
		});

		it('should respond 413 when an upload exceeds a count limit', async () => {
			const uploadOneFile = multer({ storage: multer.memoryStorage(), limits: { files: 1 } }).any();
			const response = await createApp(uploadOneFile)
				.post('/')
				.attach('files', Buffer.from('1'), 'a.csv')
				.attach('files', Buffer.from('2'), 'b.csv');
			expect(response.status).to.equal(413);
		});

		it('should respond 400 when a file arrives in a field the route does not accept', async () => {
			const response = await createApp(uploadIntoOneField).post('/').attach('other', Buffer.from('1'), 'a.csv');
			expect(response.status).to.equal(400);
		});

		it('should respond 413 to a file size error raised by another copy of multer', async () => {
			const response = await createApp(throwing(createForeignMulterError('LIMIT_FILE_SIZE'))).post('/');
			expect(response.status).to.equal(413);
		});
	});

	describe('Errors carrying their own HTTP status', () => {
		it('should respond 413 when a JSON body exceeds the JSON size limit', async () => {
			const response = await createApp(json({ limit: 10 }))
				.post('/')
				.set('Content-Type', 'application/json')
				.send(JSON.stringify({ name: 'longer than ten bytes' }));
			expect(response.status).to.equal(413);
		});

		it('should respond 400 when a JSON body is malformed', async () => {
			const response = await createApp(json()).post('/').set('Content-Type', 'application/json').send('{');
			expect(response.status).to.equal(400);
		});

		it('should answer a malformed JSON body with fixed text that does not repeat the body', async () => {
			const response = await createApp(json())
				.post('/')
				.set('Content-Type', 'application/json')
				.send('{"diagnosis": "stage IV", "patient": x}');
			expect(response.status).to.equal(400);
			expect(response.body).to.have.property('message', 'The request body must be valid JSON');
			expect(JSON.stringify(response.body)).not.to.include('patient');
		});

		it('should answer other errors carrying their own client status with the standard text for that status', async () => {
			const tooLarge = await createApp(json({ limit: 10 }))
				.post('/')
				.set('Content-Type', 'application/json')
				.send(JSON.stringify({ name: 'longer than ten bytes' }));
			const unsupported = await createApp(
				throwing(Object.assign(new Error('charset "koi8-r" unsupported'), { expose: true, status: 415 })),
			).post('/');
			expect(tooLarge.body).to.have.property('message', 'Payload Too Large');
			expect(unsupported.status).to.equal(415);
			expect(unsupported.body).to.have.property('message', 'Unsupported Media Type');
		});

		it('should answer a client error status with its standard text whether or not it is marked safe to expose', async () => {
			const marked = Object.assign(new Error('Record 42 is not in this study'), { expose: true, status: 404 });
			const unmarked = Object.assign(new Error('Record 42 is not in this study'), { status: 404 });
			const responses = await Promise.all([marked, unmarked].map((error) => createApp(throwing(error)).post('/')));
			responses.forEach((response) => {
				expect(response.status).to.equal(404);
				expect(response.body).to.have.property('message', 'Not Found');
			});
		});

		it('should respond 400 to a route parameter that cannot be decoded, without repeating it', async () => {
			const app = express();
			app.get('/submission/:submissionId', (_req, res) => {
				res.sendStatus(200);
			});
			app.use(createErrorHandler({ logger: silentLogger }));
			const response = await supertest(app).get('/submission/%E0%A4%A');
			expect(response.status).to.equal(400);
			expect(response.body).to.have.property('message', 'Bad Request');
			expect(JSON.stringify(response.body)).not.to.include('%E0');
		});
	});

	describe('Overrides', () => {
		const uploadOneByteFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 } }).any();
		const refusal: ErrorResponse = { error: 'Request Refused', message: 'The request was refused', status: 400 };
		const refuse = (): ErrorResponse => refusal;
		const withOverrides = (overrides: Parameters<typeof createErrorHandler>[0]): ErrorRequestHandler =>
			createErrorHandler({ logger: silentLogger, ...overrides });

		it('should send the response the upload override returns for an upload error', async () => {
			const response = await createAppWithHandler(withOverrides({ uploadErrors: refuse }), uploadOneByteFiles)
				.post('/')
				.attach('files', Buffer.from('12'), 'a.csv');
			expect(response.status).to.equal(400);
			expect(response.body).to.eql({ error: 'Request Refused', message: 'The request was refused' });
		});

		it('should pass the upload error and the default response to the upload override', async () => {
			const received: Array<{ defaultResponse: ErrorResponse; error: Error }> = [];
			const record = (error: Error, defaultResponse: ErrorResponse): ErrorResponse => {
				received.push({ defaultResponse, error });
				return defaultResponse;
			};
			const response = await createAppWithHandler(withOverrides({ uploadErrors: record }), uploadOneByteFiles)
				.post('/')
				.attach('files', Buffer.from('12'), 'a.csv');
			expect(response.status).to.equal(413);
			expect(received).to.have.length(1);
			expect(received[0]?.error).to.have.property('code', 'LIMIT_FILE_SIZE');
			expect(received[0]?.defaultResponse).to.include({ error: 'MulterError', message: 'File too large', status: 413 });
		});

		it('should send the response the client error override returns for an error carrying its own status', async () => {
			const response = await createAppWithHandler(withOverrides({ clientErrors: refuse }), json())
				.post('/')
				.set('Content-Type', 'application/json')
				.send('{');
			expect(response.status).to.equal(400);
			expect(response.body).to.eql({ error: 'Request Refused', message: 'The request was refused' });
		});

		it('should apply only the override for the kind of error raised', async () => {
			const response = await createAppWithHandler(withOverrides({ clientErrors: refuse }), uploadOneByteFiles)
				.post('/')
				.attach('files', Buffer.from('12'), 'a.csv');
			expect(response.status).to.equal(413);
			expect(response.body).to.have.property('error', 'MulterError');
		});

		it('should respond to Lyric error types and other errors as it does without overrides', async () => {
			const handler = withOverrides({ clientErrors: refuse, uploadErrors: refuse });
			const lyricError = await createAppWithHandler(handler, throwing(new NotFound('Category not found'))).post('/');
			const otherError = await createAppWithHandler(handler, throwing(new Error('Unexpected'))).post('/');
			expect(lyricError.status).to.equal(404);
			expect(otherError.status).to.equal(500);
		});
	});

	describe('Unexpected errors', () => {
		const unexpectedError = new Error('connect ECONNREFUSED 10.0.0.5:5432');
		const fixedResponseBody = { error: 'Internal Server Error', message: 'Something unexpected happened' };

		it('should respond 500 with fixed text to an error of any other type', async () => {
			const response = await createApp(throwing(unexpectedError)).post('/');
			expect(response.status).to.equal(500);
			expect(response.body).to.eql(fixedResponseBody);
		});

		it('should leave the error details out of the response', async () => {
			const error = Object.assign(new Error('Query failed'), { cause: { query: 'select * from submitted_data' } });
			const response = await createApp(throwing(error)).post('/');
			expect(response.body).to.eql(fixedResponseBody);
		});

		it('should log the original error with the request it answered', async () => {
			const { errors, logger } = createRecordingLogger();
			await createAppWithHandler(createErrorHandler({ logger }), throwing(unexpectedError)).post('/?page=2');
			expect(errors).to.have.length(1);
			expect(errors[0]?.at(-1)).to.deep.include({
				errorMessage: 'connect ECONNREFUSED 10.0.0.5:5432',
				errorName: 'Error',
				method: 'POST',
				path: '/',
			});
			expect(errors[0]?.at(-1)).to.have.property('stack').that.is.a('string');
		});

		it('should respond 500 with fixed text when a value other than an error is thrown', async () => {
			const throwingString: RequestHandler = () => {
				throw 'connection lost';
			};
			const response = await createApp(throwingString).post('/');
			expect(response.status).to.equal(500);
			expect(response.body).to.eql(fixedResponseBody);
		});

		it('should respond 500 with fixed text to an error carrying a server error status', async () => {
			const error = Object.assign(new Error('Upstream failed'), { expose: false, status: 502 });
			const response = await createApp(throwing(error)).post('/');
			expect(response.status).to.equal(500);
			expect(response.body).to.eql(fixedResponseBody);
		});
	});

	describe('Errors raised after the response has started', () => {
		const lostConnection = new ServiceUnavailable('Connection to the database was lost');

		/**
		 * A streaming route that writes its first record and then fails with the error Lyric's repositories raise when
		 * the database can't be reached.
		 */
		const streamThenFail: RequestHandler = (_req, res, next) => {
			res.setHeader('Content-Type', 'application/x-ndjson');
			res.write('{"id":1}\n');
			next(lostConnection);
		};

		/**
		 * Builds an app with Lyric's error handler and, after it, an error handler that keeps what reaches it and then
		 * ends the response as failed, as Express's own final handler does.
		 */
		const createStreamingApp = (logger: Logger): { delegated: unknown[]; request: supertest.Agent } => {
			const delegated: unknown[] = [];
			const app = express();
			app.get('/', streamThenFail);
			app.use(createErrorHandler({ logger }));
			app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
				delegated.push(error);
				res.destroy();
			});
			return { delegated, request: supertest(app) };
		};

		it('should hand the original error on to Express rather than send a second response', async () => {
			const { delegated, request } = createStreamingApp(silentLogger);
			await request.get('/').catch(ignore);
			expect(delegated).to.eql([lostConnection]);
		});

		it('should log the original error with the request it interrupted', async () => {
			const { errors, logger } = createRecordingLogger();
			const { request } = createStreamingApp(logger);
			await request.get('/').catch(ignore);
			expect(errors).to.have.length(1);
			expect(errors[0]?.at(-1)).to.deep.include({
				errorMessage: 'Connection to the database was lost',
				method: 'GET',
				path: '/',
			});
		});

		it('should end the response as failed, so the client never receives it as complete', async () => {
			const app = express();
			// Keeps Express's own final handler from printing the error during the test run
			app.set('env', 'test');
			app.get('/', streamThenFail);
			app.use(createErrorHandler({ logger: silentLogger }));

			const outcome = await supertest(app)
				.get('/')
				.then(
					() => 'completed',
					() => 'failed',
				);
			expect(outcome).to.equal('failed');
		});
	});
});
