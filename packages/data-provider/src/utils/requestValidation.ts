import { ParamsDictionary, RequestHandler } from 'express-serve-static-core';
import { ZodError, ZodSchema } from 'zod';

import { BadRequest, InternalServerError } from './errors.js';

export declare type RequestValidation<TBody, TQuery> = {
	body?: ZodSchema<TBody>;
	query?: ZodSchema<TQuery>;
};

/**
 * Validate the body using Zod parse
 * @param schema Zod objects used to validate request
 * @returns Throws a Bad Request when validation fails
 */
export function validateRequest<TBody, TQuery>(
	schema: RequestValidation<TBody, TQuery>,
	handler: RequestHandler<ParamsDictionary, unknown, TBody, TQuery>,
): RequestHandler<ParamsDictionary, unknown, TBody, TQuery> {
	const LOG_MODULE = 'REQUEST_VALIDATION';
	return async (req, res, next) => {
		try {
			if (schema.body) {
				schema.body.parse(req.body);
			}

			if (schema.query) {
				schema.query.parse(req.query);
			}

			return handler(req, res, next);
		} catch (error) {
			if (error instanceof ZodError) {
				const errorMessages = error.errors.map((issue) => `${issue.path.join('.')} is ${issue.message}`).join(' | ');
				console.log(LOG_MODULE, req.method, req.url, JSON.stringify(errorMessages));
				next(new BadRequest(errorMessages));
			} else {
				console.error(LOG_MODULE, req.method, req.url, 'Internal Server Error');
				next(new InternalServerError());
			}
		}
	};
}
