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
 * Options for `createErrorHandler`. The two overrides replace the responses to errors raised by libraries rather than
 * by Lyric; Lyric's own error types are always answered with their mapped status.
 * - `clientErrors`: errors that carry their own client error status, such as body-parser's "request entity too
 *   large" (413) or malformed JSON (400).
 * - `logger`: where an unexpected error is logged before it is answered with a fixed 500. Defaults to a console
 *   logger at `info` level.
 * - `uploadErrors`: uploads refused by multer, answered by default with 413 for a limit and 400 otherwise.
 */
export type ErrorHandlerOptions = {
	clientErrors?: ErrorResponseOverride;
	logger?: Logger;
	uploadErrors?: ErrorResponseOverride;
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

// multer's codes for an upload exceeding one of its configured limits; its other codes describe a malformed upload.
const UPLOAD_LIMIT_CODES: ReadonlySet<string> = new Set([
	'LIMIT_FIELD_COUNT',
	'LIMIT_FIELD_KEY',
	'LIMIT_FIELD_VALUE',
	'LIMIT_FILE_COUNT',
	'LIMIT_FILE_SIZE',
	'LIMIT_PART_COUNT',
]);

/**
 * multer raises a `MulterError` for a multipart upload it refuses. It is matched by name and code rather than with
 * `instanceof`, because a consumer may run its own copy of multer in front of this handler.
 */
const getUploadErrorStatus = (err: Error): number | undefined => {
	if (err.name === 'MulterError' && 'code' in err && typeof err.code === 'string') {
		return UPLOAD_LIMIT_CODES.has(err.code) ? 413 : 400;
	}
	return undefined;
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

const getKnownErrorResponse = (
	err: Error,
	{ clientErrors, uploadErrors }: ErrorHandlerOptions,
): ErrorResponse | undefined => {
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
	const uploadStatus = getUploadErrorStatus(err);
	if (typeof uploadStatus === 'number') {
		return respondWith(uploadStatus, uploadErrors);
	}
	const clientStatus = getClientErrorStatus(err);
	if (typeof clientStatus === 'number') {
		return respondWith(clientStatus, clientErrors, { message: getClientErrorMessage(err, clientStatus) });
	}
	return undefined;
};

// Express passes on whatever was thrown, which is not always an Error.
const asError = (thrown: unknown): Error => (thrown instanceof Error ? thrown : new Error(String(thrown)));

const describeForLog = (err: Error, req: Request): Record<string, unknown> => ({
	errorMessage: err.message,
	errorName: err.name,
	method: req.method,
	path: `${req.baseUrl}${req.path}`,
	stack: err.stack,
});

/**
 * Creates Express error middleware that answers each error with a status and a `{ error, message, details }` body.
 * Lyric's error types get their mapped status; multer upload refusals get 413 for a limit and 400 otherwise; errors
 * carrying their own client error status, such as body-parser's, get that status with fixed text, since a library's
 * message can repeat what was submitted. Anything else is logged in full
 * and answered with a fixed 500, so nothing about it reaches the client. `options` replaces the response for the
 * library errors, for a consumer that sends its own instead.
 *
 * An error raised after the response has started, such as partway through a stream, can no longer be answered, so
 * it is logged and handed on to Express, which ends the response as failed.
 */
export const createErrorHandler = ({
	clientErrors,
	logger = getLogger({}),
	uploadErrors,
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

		const knownResponse = getKnownErrorResponse(err, { clientErrors, uploadErrors });
		if (knownResponse) {
			const { details, error, message, status } = knownResponse;
			return res.status(status).send({ error, message, details });
		}

		logger.error(LOG_MODULE, 'Unexpected error answered with a fixed 500 response', describeForLog(err, req));
		return res.status(500).send({ error: unexpectedError.name, message: unexpectedError.message });
	};
};

/**
 * Express error middleware with the default responses described on `createErrorHandler`. Mount it after every
 * router; use `createErrorHandler` instead to override the responses to library errors.
 */
export const errorHandler = createErrorHandler();
