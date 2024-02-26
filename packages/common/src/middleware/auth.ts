import { NextFunction, Request, Response } from 'express';

// Create an authentication middleware
export const auth = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: auth here
	console.log(`auth`);
	next();
};
