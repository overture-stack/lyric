import { Request } from 'express';

import { type UserSessionResult } from '@overture-stack/lyric';

/**
 * Function to implement authentication logic.
 * This function is called by the authMiddleware to verify the user's authentication.
 * It returns the authentication result, which includes the authentication status and user information.
 *
 * @param req - Express request object
 * @returns User session result
 */
export const authHandler = (_req: Request) => {
	// Note: Customize this implementation with your auth provider.
	// Setting an Admin Guest user for testing purposes.
	const authResult: UserSessionResult = {
		user: { username: 'Guest', allowedWriteOrganizations: [], isAdmin: true },
	};

	return authResult;
};
