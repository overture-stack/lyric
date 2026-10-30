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

/**
 * The result returned by a `CustomAuthenticationHandler`.
 * - On success, `user` holds the authenticated user's session.
 * - On failure, `errorCode` holds the HTTP status code to respond with and `errorMessage` describes the failure.
 *   When `errorCode` is set, `user` is ignored.
 */
export type UserSessionResult<TUser extends UserSession = UserSession> = {
	user?: TUser;
	errorCode?: number;
	errorMessage?: string;
};

/**
 * An application-provided function that authenticates an incoming request and identifies the user making it.
 * It can be synchronous or return a Promise.
 *
 * On success, it returns a `UserSessionResult` with `user` set to the authenticated user's session.
 *
 * On failure, it does either of the following:
 * - Throws a Lyric error type exported from `@overture-stack/lyric`, such as `Unauthorized` when the request
 *   has no valid credentials or `Forbidden` when the user is not permitted access.
 * - Returns a `UserSessionResult` with `errorCode` set to one of `400`, `401`, `403` or `503`, and
 *   `errorMessage` describing the failure. Any `user` in the result is ignored.
 */
export type CustomAuthenticationHandler<TResult extends UserSessionResult = UserSessionResult> = (
	req: Request,
) => TResult | Promise<TResult>;

/**
 * Authentication settings for Lyric's routes.
 * - `enabled`: whether requests require authentication. When `false`, no request requires it.
 * - `protectedMethods`: the HTTP methods that require authentication. When omitted, all methods require it.
 * - `customAuthHandler`: the `CustomAuthenticationHandler` that authenticates requests that require it.
 */
export type AuthConfig<TResult extends UserSessionResult = UserSessionResult> = {
	enabled: boolean;
	protectedMethods?: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
	customAuthHandler?: CustomAuthenticationHandler<TResult>;
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
 * Creates Express middleware that authenticates requests using the `customAuthHandler` from `authConfig`.
 * Requests are passed through without authentication when auth is disabled or the request method is not
 * one of the `protectedMethods`.
 *
 * The middleware implements no authentication scheme of its own (such as validating a JWT or a session
 * cookie). Verifying credentials and identifying the user is done entirely by the `customAuthHandler`, so
 * without a handler every request that requires authentication is rejected.
 *
 * When the `CustomAuthenticationHandler` returns a `user`, the session is attached to the request as
 * `req.user` and the request continues. Otherwise, the middleware passes an error to `next` for
 * `errorHandler` to format:
 * - `errorCode` returned: the Lyric error type for that status (`400`, `401`, `403` or `503`) with
 *   `errorMessage`. Any other status becomes `InternalServerError`.
 * - No `user` and no `errorCode` returned, or no handler configured: `Unauthorized`.
 * - Lyric error type thrown (such as `Unauthorized` or `Forbidden`): that error, unchanged.
 * - Any other error thrown: `InternalServerError` with the message "Authorization check failed.".
 *   The original error message is logged and not sent in the response.
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
