import { NextFunction, Request, Response } from 'express';

import type { AuthConfig, UserSessionResult } from '../config/config.js';
import type { UserSession } from '../utils/express.js';

// Extends the Request interface to include a custom `user` object
declare module 'express-serve-static-core' {
	interface Request {
		user?: UserSession;
	}
}

/**
 * Middleware to handle authentication based on the provided auth configuration.
 * It verifies the user's authentication implemented by the custom authentication handler
 * If authentication is valid, it attaches the user information to the request object;
 * Otherwise, it returns the appropriate error codes.
 * @param authConfig
 * @returns
 */
export const authMiddleware = (authConfig: AuthConfig) => {
	return (req: Request, res: Response, next: NextFunction) => {
		// proceed to the next middleware or route handler if auth is disabled
		if (!authConfig.enabled) return next();

		try {
			const authResult: UserSessionResult =
				typeof authConfig.customAuthHandler === 'function'
					? authConfig.customAuthHandler(req)
					: { authStatus: 'invalid-auth' };

			switch (authResult.authStatus) {
				case 'authenticated':
					req.user = authResult.user;
					return next();

				case 'no-auth':
					return res.status(401).json({ message: 'Unauthorized: No token provided' });

				case 'invalid-auth':
				default:
					return res.status(403).json({ message: 'Forbidden: Invalid token' });
			}
		} catch (error) {
			console.error(`Error verifying token ${error}`);
			return res.status(403).json({ message: 'Forbidden: Invalid token' });
		}
	};
};
