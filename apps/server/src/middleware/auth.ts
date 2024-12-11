import { NextFunction, Request, Response } from 'express';

import { UserSession } from '@overture-stack/lyric';

// Extend the Request interface to include a `user` property
declare module 'express-serve-static-core' {
	interface Request {
		user?: UserSession;
	}
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
	// Middleware for implementing authentication logic.

	req.user = {
		username: 'Guest', // Example: Adjust fields as per your `UserSession` type
	};
	next(); // Continue to the next middleware or route handler
};
