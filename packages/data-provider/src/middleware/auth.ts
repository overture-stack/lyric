import { NextFunction, Request, Response } from 'express';

import {
	BadRequest,
	Forbidden,
	getErrorMessage,
	InternalServerError,
	LYRIC_ERROR_TYPES,
	ServiceUnavailable,
	Unauthorized,
} from '../utils/errors.js';

export type UserSession = {
	username: string;
	isAdmin: boolean;
	allowedWriteOrganizations: string[];
	allowedReadOrganizations: string[];
};

export type UserSessionResult<TUser extends UserSession = UserSession> = {
	user?: TUser;
	errorCode?: number;
	errorMessage?: string;
};

export type AuthConfig<TResult extends UserSessionResult = UserSessionResult> = {
	enabled: boolean;
	protectedMethods?: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
	customAuthHandler?: (req: Request) => TResult | Promise<TResult>;
};

// Extends the Request interface to include a custom `user` object
export type RequestWithUser<TUser extends UserSession = UserSession> = Request & {
	user?: TUser;
};

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
 * Converts the `errorCode` and `errorMessage` returned by a custom auth handler into the error type
 * that `errorHandler` maps to the same HTTP status code.
 * Returns an `InternalServerError` for status codes that have no matching error type.
 * When `message` is omitted, the error type's default message is used, or the status name for
 * types that require a message.
 */
const createErrorFromStatus = (status: number, message?: string): Error => {
	switch (status) {
		case 400:
			return new BadRequest(message || 'Bad Request');
		case 401:
			return new Unauthorized(message);
		case 403:
			return new Forbidden(message || 'Forbidden');
		case 503:
			return new ServiceUnavailable(message);
		default:
			return new InternalServerError(message);
	}
};

/**
 * Middleware to handle authentication based on the provided auth configuration.
 * It verifies the user's authentication implemented by the custom authentication handler.
 * If authentication is valid, it attaches the user information to the request object.
 * Otherwise, it passes an error to `next` for `errorHandler` to format:
 * - `errorCode` returned by the handler: the error type matching that status, with `errorMessage`.
 *   Status codes without a matching error type become `InternalServerError`.
 * - No `user` returned by the handler: `Unauthorized`.
 * - Handler throws a Lyric error type (such as `Unauthorized` or `ServiceUnavailable`): that error, unchanged.
 * - Handler throws any other error: `InternalServerError` with the message "Authorization check failed.".
 *   The original error message is logged and not sent in the response.
 * @param authConfig
 * @returns
 */
export const authMiddleware = (authConfig: AuthConfig) => {
	return async (req: RequestWithUser, _res: Response, next: NextFunction) => {
		if (shouldBypassAuth(req, authConfig)) {
			return next();
		}

		try {
			const authResult =
				typeof authConfig.customAuthHandler === 'function' ? await authConfig.customAuthHandler(req) : {};

			if (authResult.errorCode) {
				return next(createErrorFromStatus(authResult.errorCode, authResult.errorMessage));
			}

			if (!authResult.user) {
				return next(new Unauthorized('User is not authenticated'));
			}

			req.user = authResult.user;
			return next();
		} catch (error) {
			// A custom auth handler that throws a Lyric error type is choosing the response status
			if (LYRIC_ERROR_TYPES.some((errorType) => error instanceof errorType)) {
				return next(error);
			}
			// Messages from unknown errors can expose internal details (such as token validation failures or
			// auth service addresses), so they are logged instead of being returned to the client
			console.error(`Error thrown validating user auth: ${getErrorMessage(error)}`);
			return next(new InternalServerError('Authorization check failed.'));
		}
	};
};
