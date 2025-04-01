import { NextFunction, Request, Response } from 'express';

export type UserSession = {
	username: string;
	isAdmin: boolean;
	allowedWriteOrganizations: string[];
};

export type UserSessionResult = {
	user?: UserSession;
	errorCode?: number;
	errorMessage?: string;
};

export type AuthConfig = {
	enabled: boolean;
	customAuthHandler?: (req: Request) => UserSessionResult;
};

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
		if (!authConfig.enabled) {
			return next();
		}

		try {
			const authResult: UserSessionResult =
				typeof authConfig.customAuthHandler === 'function' ? authConfig.customAuthHandler(req) : {};

			if (authResult.errorCode) {
				return res.status(authResult.errorCode).json({ message: authResult.errorMessage });
			}

			req.user = authResult.user;
			return next();
		} catch (error) {
			console.error(`Error verifying token ${error}`);
			return res.status(403).json({ message: 'Forbidden: Invalid token' });
		}
	};
};
