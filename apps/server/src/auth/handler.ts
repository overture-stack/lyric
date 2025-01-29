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
	// Guest User Session
	const authResult: UserSessionResult = {
		user: { username: 'Guest' },
	};

	return authResult;
};
