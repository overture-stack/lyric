import { NextFunction, Request, Response } from 'express';
import {
	BadRequest,
	NotFound,
	NotImplemented,
	ServiceUnavailable,
	StateConflict,
	TSVParseError,
} from '../utils/errors.js';

/**
 * A Middleware use to map Error types
 * @param err An Error instance
 * @param req Incoming HTTP Request object
 * @param res HTTP Response Object
 * @param next Next middleware function
 * @returns An HTTP Response Object with the corresponding HTTP code and message
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): any => {
	console.error('error handler received error: ', err);
	let status: number;
	let customizableMsg = err.message;
	switch (true) {
		case err instanceof BadRequest:
			status = 400;
			break;
		case err instanceof NotFound:
			status = 404;
			break;
		case err instanceof StateConflict:
			status = 409;
			break;
		case err instanceof TSVParseError:
			status = 422;
			break;
		case err instanceof NotImplemented:
			status = 501;
			break;
		case err instanceof ServiceUnavailable:
			status = 503;
			break;
		case (err as any).name == 'CastError':
			status = 404;
			err.name = 'Not found';
			customizableMsg = 'Id not found';
			break;
		default:
			status = 500;
	}

	return res.status(status).send({ error: err.name, message: customizableMsg });
};
