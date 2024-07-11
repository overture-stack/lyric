import { NextFunction, Request, Response } from 'express';

import {
	BadRequest,
	InternalServerError,
	NotFound,
	NotImplemented,
	ServiceUnavailable,
	StatusConflict,
	TSVParseError,
} from '../utils/errors.js';

/**
 * A Middleware use to map Error types
 * @param err An Error instance
 * @param req Incoming HTTP Request object
 * @param res HTTP Response Object
 * @returns An HTTP Response Object with the corresponding HTTP code and message
 */

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): any => {
	console.error('error handler received error: ', err);
	let status: number;
	const customizableMsg = err.message;
	const details = err.cause;
	switch (true) {
		case err instanceof BadRequest:
			status = 400;
			break;
		case err instanceof NotFound:
			status = 404;
			break;
		case err instanceof StatusConflict:
			status = 409;
			break;
		case err instanceof TSVParseError:
			status = 422;
			break;
		case err instanceof InternalServerError:
			status = 500;
			break;
		case err instanceof NotImplemented:
			status = 501;
			break;
		case err instanceof ServiceUnavailable:
			status = 503;
			break;
		default:
			status = 500;
	}

	return res.status(status).send({ error: err.name, message: customizableMsg, details: details });
};
