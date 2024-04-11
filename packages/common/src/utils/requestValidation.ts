import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary, RequestHandler } from 'express-serve-static-core';
import { ZodError, ZodSchema, z } from 'zod';
import { BadRequest, InternalServerError } from './errors.js';

export declare type RequestValidation<TParams, TQuery, TBody, TFiles> = {
	params?: ZodSchema<TParams>;
	query?: ZodSchema<TQuery>;
	body?: ZodSchema<TBody>;
	files?: ZodSchema<TFiles>;
};

/**
 * Validate the body, path params or files using Zod parse
 * @param schema Zod objects used to validate request
 * @returns Throws a Bad Request when validation fails
 */
export function validateRequest<TParams = any, TQuery = any, TBody = any, TFiles = any>(
	schema: RequestValidation<TParams, TQuery, TBody, TFiles>,
	handler: RequestHandler<ParamsDictionary, any, TBody>,
): RequestHandler {
	const LOG_MODULE = 'REQUEST_VALIDATION';
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			if (schema.body) {
				schema.body.parse(req.body);
			}

			if (schema.params) {
				schema.params.parse(req.params);
			}

			if (schema.files) {
				schema.files.parse({ files: req.files });
			}

			return handler(req, res, next);
		} catch (error) {
			if (error instanceof ZodError) {
				const errorMessages = error.errors
					.map((issue: any) => `${issue.path.join('.')} is ${issue.message}`)
					.join(' | ');
				console.log(LOG_MODULE, req.method, req.url, JSON.stringify(errorMessages));
				next(new BadRequest(errorMessages));
			} else {
				console.error(LOG_MODULE, req.method, req.url, 'Internal Server Error');
				next(new InternalServerError());
			}
		}
	};
}
