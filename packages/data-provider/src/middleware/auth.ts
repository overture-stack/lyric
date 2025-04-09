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
	protectedMethods?: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
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

		// Check if the HTTP method of the incoming request is in the list of protected methods in the configuration.
		// If "protectedMethods" includes the incoming request method, it will be protected.
		// If "protectedMethods" is not defined or is not an array, by default every method will be protected
		if (
			Array.isArray(authConfig.protectedMethods) &&
			!authConfig.protectedMethods.some((method) => method === req.method)
		) {
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
