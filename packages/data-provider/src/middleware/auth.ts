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
	customAuthHandler?: (req: Request) => UserSessionResult | Promise<UserSessionResult>;
};

// Extends the Request interface to include a custom `user` object
declare module 'express-serve-static-core' {
	interface Request {
		user?: UserSession;
	}
}

/**
 * Determines whether the incoming request should bypass authentication,
 * based on the application's authentication configuration.
 * @param req
 * @param authConfig
 * @returns
 */
export const shouldBypassAuth = (req: Request, authConfig: AuthConfig) => {
	if (!authConfig.enabled) {
		// bypass auth if it's globally disabled
		return true;
	}

	// Skip auth if configured protectedMethods is a valid array and does not include the request method
	const protectedMethods = authConfig.protectedMethods;
	if (Array.isArray(protectedMethods) && !protectedMethods.some((method) => method === req.method)) {
		return true;
	}

	// Default: required auth
	return false;
};

/**
 * Middleware to handle authentication based on the provided auth configuration.
 * It verifies the user's authentication implemented by the custom authentication handler
 * If authentication is valid, it attaches the user information to the request object;
 * Otherwise, it returns the appropriate error codes.
 * @param authConfig
 * @returns
 */
export const authMiddleware = (authConfig: AuthConfig) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		if (shouldBypassAuth(req, authConfig)) {
			return next();
		}

		try {
			const authResult =
				typeof authConfig.customAuthHandler === 'function' ? await authConfig.customAuthHandler(req) : {};

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
