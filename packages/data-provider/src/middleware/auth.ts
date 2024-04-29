import { NextFunction, Request, Response } from 'express';

/**
 * Authorization Middleware
 * @param req Incoming HTTP Request object
 * @param res  HTTP Response Object
 * @param next Next middleware function
 */
export const auth = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: auth here
	console.log(`auth`);
	next();
};
