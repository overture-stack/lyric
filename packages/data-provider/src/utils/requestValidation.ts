import { NextFunction, Request, Response } from 'express';
import type { ParamsDictionary, RequestHandler } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { ZodError, ZodSchema, type ZodType } from 'zod';

import type { UserSession } from '../middleware/auth.js';
import { BadRequest, InternalServerError } from './errors.js';

export declare type RequestValidation<TBody, TQuery, TParams> = {
	body?: ZodType<TBody>;
	query?: ZodType<TQuery>;
	pathParams?: ZodType<TParams>;
};

type RequestWithUser<
	TParams extends ParamsDictionary = ParamsDictionary,
	TBody = unknown,
	TQuery extends ParsedQs = ParsedQs,
> = Request<TParams, unknown, TBody, TQuery> & {
	user?: UserSession;
};
/**
 * Validate the body using Zod parse
 * @param schema Zod objects used to validate request
 * @returns Throws a Bad Request when validation fails
 */
export function validateRequest<
	TBody,
	TQuery extends ParsedQs = ParsedQs,
	TParams extends ParamsDictionary = ParamsDictionary,
>(
	schema: RequestValidation<TBody, TQuery, TParams>,
	handler: (req: RequestWithUser<TParams, TBody, TQuery>, res: Response, next: NextFunction) => unknown,
): RequestHandler<TParams, unknown, TBody, TQuery> {
	const LOG_MODULE = 'REQUEST_VALIDATION';
	return async (req, res, next) => {
		try {
			if (schema.body) {
				schema.body.parse(req.body);
			}

			if (schema.query) {
				schema.query.parse(req.query);
			}

			if (schema.pathParams) {
				schema.pathParams.parse(req.params);
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
