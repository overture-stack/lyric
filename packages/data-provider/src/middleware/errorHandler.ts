import { STATUS_CODES } from 'node:http';

import { NextFunction, Request, Response } from 'express';

import { getLogger, type Logger } from '../config/logger.js';
import {
	BadRequest,
	ContentTooLarge,
	Forbidden,
	InternalServerError,
	LengthRequired,
	NotFound,
	NotImplemented,
	ServiceUnavailable,
	StatusConflict,
	TSVParseError,
	Unauthorized,
} from '../utils/errors.js';

/**
 * `errorHandler`'s response to an error: `status` is the HTTP status code, and the other fields form the
 * `{ error, message, details }` response body.
 */
export type ErrorResponse = {
	details?: unknown;
	error: string;
	message: string;
	status: number;
};

/**
 * Replaces the response sent for one kind of error. Receives the error and Lyric's default response to it, and
 * returns the response to send instead, so a consumer can hide or reword what a library reports.
 */
export type ErrorResponseOverride = (error: Error, defaultResponse: ErrorResponse) => ErrorResponse;

/**
 * Options for `createErrorHandler`.
 * - `clientErrors`: the replacement for the response to an error carrying its own client error status.
 * - `logger`: the logger for unexpected errors.
 */
export type ErrorHandlerOptions = {
	clientErrors?: ErrorResponseOverride;
	logger?: Logger;
};

type ErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => unknown;

const LOG_MODULE = 'ERROR_HANDLER';

const getLyricErrorStatus = (err: Error): number | undefined => {
	switch (true) {
		case err instanceof BadRequest:
			return 400;
		case err instanceof Unauthorized:
			return 401;
		case err instanceof Forbidden:
			return 403;
		case err instanceof NotFound:
			return 404;
		case err instanceof StatusConflict:
			return 409;
		case err instanceof LengthRequired:
			return 411;
		case err instanceof ContentTooLarge:
			return 413;
		case err instanceof TSVParseError:
			return 422;
		case err instanceof InternalServerError:
			return 500;
		case err instanceof NotImplemented:
			return 501;
		case err instanceof ServiceUnavailable:
			return 503;
		default:
			return undefined;
	}
};

/**
 * Express and middleware such as body-parser raise errors following the http-errors convention, where `status` holds
 * the response status. A client error status is taken at its word; a server error status is treated as unexpected.
 */
const getClientErrorStatus = (err: Error): number | undefined =>
	'status' in err && typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : undefined;

/**
 * A library's message can repeat what was submitted, as body-parser's does for malformed JSON, so a client error
 * from a library is answered with fixed text: the rule broken where it is known, the status's own name otherwise.
 */
const getClientErrorMessage = (err: Error, status: number): string =>
	'type' in err && err.type === 'entity.parse.failed'
		? 'The request body must be valid JSON'
		: (STATUS_CODES[status] ?? 'The request could not be processed');

const getKnownErrorResponse = (err: Error, { clientErrors }: ErrorHandlerOptions): ErrorResponse | undefined => {
	const respondWith = (
		status: number,
		override?: ErrorResponseOverride,
		{ details, message }: Pick<ErrorResponse, 'details' | 'message'> = { details: err.cause, message: err.message },
	): ErrorResponse => {
		const defaultResponse = { details, error: err.name, message, status };
		return override ? override(err, defaultResponse) : defaultResponse;
	};

	const lyricStatus = getLyricErrorStatus(err);
	if (typeof lyricStatus === 'number') {
		return respondWith(lyricStatus);
	}
	const clientStatus = getClientErrorStatus(err);
	if (typeof clientStatus === 'number') {
		return respondWith(clientStatus, clientErrors, { message: getClientErrorMessage(err, clientStatus) });
	}
	return undefined;
};

/**
 * Express passes on whatever was thrown, which is not always an Error. Turning it into text can itself throw, when
 * its own `toString` does, so that case gets a fixed message.
 */
const asError = (thrown: unknown): Error => {
	if (thrown instanceof Error) {
		return thrown;
	}
	try {
		return new Error(String(thrown));
	} catch {
		return new Error('A value that is not an Error was thrown, and could not be turned into text');
	}
};

const describeForLog = (err: Error, req: Request): Record<string, unknown> => ({
	errorMessage: err.message,
	errorName: err.name,
	method: req.method,
	path: `${req.baseUrl}${req.path}`,
	stack: err.stack,
});

// The only call here that can throw is a consumer's `clientErrors` override
const tryKnownErrorResponse = (
	err: Error,
	options: ErrorHandlerOptions,
): { knownResponse?: ErrorResponse; overrideError?: Error } => {
	try {
		return { knownResponse: getKnownErrorResponse(err, options) };
	} catch (overrideError) {
		return { overrideError: asError(overrideError) };
	}
};

/**
 * Creates Express error middleware that answers each error with a status and a `{ error, message, details }` body:
 * - a Lyric error type: its mapped status, with the error's own message and `details`;
 * - an error carrying a client error status (4xx), such as Express's and body-parser's: that status, with fixed
 *   text for `message` and no `details`;
 * - any other error: a fixed 500, the error being logged under `ERROR_HANDLER` with the request's method and path.
 *   No multer error is recognized, so an upload error reaches this case unless `convertUploadErrors` has converted
 *   it.
 *
 * An error raised after the response has started is logged and passed on to Express, which ends the response as
 * failed.
 *
 * With `clientErrors`, its result replaces the response to a client error status; if `clientErrors` throws, its
 * error is logged and the client error is answered with the fixed 500. Without `logger`, unexpected errors are
 * logged to the console at `info` level.
 */
export const createErrorHandler = ({
	clientErrors,
	logger = getLogger({}),
}: ErrorHandlerOptions = {}): ErrorHandler => {
	const unexpectedError = new InternalServerError();
	return (thrown, req, res, next) => {
		const err = asError(thrown);
		if (res.headersSent) {
			logger.error(
				LOG_MODULE,
				'Error raised after the response started, ending it as failed',
				describeForLog(err, req),
			);
			return next(err);
		}

		const { knownResponse, overrideError } = tryKnownErrorResponse(err, { clientErrors });
		if (knownResponse) {
			const { details, error, message, status } = knownResponse;
			return res.status(status).send({ error, message, details });
		}

		if (overrideError) {
			logger.error(LOG_MODULE, 'clientErrors override threw, answered with a fixed 500 response', {
				...describeForLog(overrideError, req),
				originalErrorName: err.name,
			});
		} else {
			logger.error(LOG_MODULE, 'Unexpected error answered with a fixed 500 response', describeForLog(err, req));
		}
		return res.status(500).send({ error: unexpectedError.name, message: unexpectedError.message });
	};
};

/**
 * Express error middleware: `createErrorHandler()` with no options. It answers errors raised by the routes and
 * middleware mounted before it.
 */
export const errorHandler = createErrorHandler();
