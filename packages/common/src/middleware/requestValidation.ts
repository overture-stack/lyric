import { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { BadRequest, InternalServerError } from '../utils/errors.js';

/**
 * Validate the body, path params or files using Zod parse
 * @param schema Zod objects used to validate request
 * @returns Throws a Bad Request when validation fails
 */
export function validateRequest(
	schema: Partial<{ body: z.ZodObject<any, any>; pathParams: z.ZodObject<any, any>; files: z.ZodObject<any, any> }>,
) {
	const LOG_MODULE = 'REQUEST_VALIDATION';
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			if (schema.body) {
				schema.body.parse(req.body);
			}

			if (schema.pathParams) {
				schema.pathParams.parse(req.params);
			}

			if (schema.files) {
				schema.files.parse({ files: req.files });
			}

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const errorMessages = error.errors
					.map((issue: any) => `${issue.path.join('.')} is ${issue.message}`)
					.join(' | ');
				console.log(LOG_MODULE, req.method, req.url, JSON.stringify(errorMessages));
				throw new BadRequest(errorMessages);
			} else {
				console.error(LOG_MODULE, req.method, req.url, 'Internal Server Error');
				throw new InternalServerError();
			}
		}
	};
}
