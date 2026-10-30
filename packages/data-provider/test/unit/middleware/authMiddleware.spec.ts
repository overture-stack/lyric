import { expect } from 'chai';
import type { NextFunction, Request, Response } from 'express';
import { describe, it } from 'mocha';

import {
	type AuthConfig,
	authMiddleware,
	type RequestWithUser,
	type UserSession,
} from '../../../src/middleware/auth.js';
import { Forbidden, InternalServerError, ServiceUnavailable, Unauthorized } from '../../../src/utils/errors.js';

const user: UserSession = {
	username: 'John Doe',
	isAdmin: false,
	allowedWriteOrganizations: [],
	allowedReadOrganizations: [],
};

/**
 * Runs the auth middleware for a GET request with the given auth handler.
 * Returns the request and the argument the middleware passed to `next`.
 */
const runMiddleware = async (
	customAuthHandler: AuthConfig['customAuthHandler'],
): Promise<{ request: RequestWithUser; nextArgument: unknown }> => {
	// The middleware only reads `method` from the request and never uses the response
	const request = { method: 'GET' } as RequestWithUser;
	const response = {} as Response;
	let nextArgument: unknown;
	const next: NextFunction = (argument?: unknown) => {
		nextArgument = argument;
	};
	await authMiddleware({ enabled: true, customAuthHandler })(request, response, next);
	return { request, nextArgument };
};

describe('Auth middleware', () => {
	it('should attach the user and call next without an error when authentication succeeds', async () => {
		const { request, nextArgument } = await runMiddleware(() => ({ user }));
		expect(nextArgument).to.eql(undefined);
		expect(request.user).to.eql(user);
	});

	it('should pass Unauthorized to next when the handler returns errorCode 401', async () => {
		const { nextArgument } = await runMiddleware(() => ({ errorCode: 401, errorMessage: 'No token provided' }));
		expect(nextArgument).to.be.instanceOf(Unauthorized);
		expect(nextArgument).to.have.property('message', 'No token provided');
	});

	it('should pass Forbidden to next when the handler returns errorCode 403', async () => {
		const { nextArgument } = await runMiddleware(() => ({ errorCode: 403, errorMessage: 'Access denied' }));
		expect(nextArgument).to.be.instanceOf(Forbidden);
	});

	it('should pass InternalServerError to next when the handler returns an unmapped errorCode', async () => {
		const { nextArgument } = await runMiddleware(() => ({ errorCode: 418, errorMessage: 'Unexpected' }));
		expect(nextArgument).to.be.instanceOf(InternalServerError);
	});

	it('should pass Unauthorized to next when the handler returns no user', async () => {
		const { request, nextArgument } = await runMiddleware(() => ({}));
		expect(nextArgument).to.be.instanceOf(Unauthorized);
		expect(request.user).to.eql(undefined);
	});

	it('should pass Unauthorized to next when no handler is configured', async () => {
		const { nextArgument } = await runMiddleware(undefined);
		expect(nextArgument).to.be.instanceOf(Unauthorized);
	});

	it('should pass a thrown Lyric error to next unchanged', async () => {
		const thrownError = new ServiceUnavailable('Auth server is down');
		const { nextArgument } = await runMiddleware(() => {
			throw thrownError;
		});
		expect(nextArgument).to.equal(thrownError);
	});

	it('should pass a generic InternalServerError to next when the handler throws any other error', async () => {
		const { nextArgument } = await runMiddleware(() => {
			throw new Error('jwt malformed');
		});
		expect(nextArgument).to.be.instanceOf(InternalServerError);
		expect(nextArgument).to.have.property('message', 'Authorization check failed.');
	});

	it('should call next without an error when auth is disabled', async () => {
		// The middleware only reads `method` from the request and never uses the response
		const request = { method: 'GET' } as Request;
		let nextArgument: unknown = 'not called';
		await authMiddleware({ enabled: false })(request, {} as Response, (argument?: unknown) => {
			nextArgument = argument;
		});
		expect(nextArgument).to.eql(undefined);
	});
});
