import { type AuthConfig, type RequestWithUser, shouldBypassAuth, type UserSession } from '../middleware/auth.js';
import { Forbidden } from './errors.js';

/**
 * The organizations a request may read submitted data from, or `undefined` for every organization:
 * - when auth is disabled or does not protect the request's method, every organization, with or without a user;
 * - when auth protects the request's method, every organization for an admin, and the user's
 *   `allowedReadOrganizations` for any other user;
 * - when auth protects the request's method and the request has no user, none: it throws `Forbidden`.
 *
 * @throws {Forbidden} when auth protects the request's method and the request has no user.
 */
export const getUserReadableOrganizations = (
	req: Pick<RequestWithUser, 'method' | 'user'>,
	authConfig: AuthConfig,
): string[] | undefined => {
	if (shouldBypassAuth(req, authConfig)) {
		return undefined;
	}
	const { user } = req;
	if (user) {
		return user.isAdmin ? undefined : user.allowedReadOrganizations;
	}
	throw new Forbidden('User is not authorized to read submitted data');
};

/**
 * checks if a user has read access to a specific organization.
 * Returns true if the user has access, false otherwise.
 * @param organization
 * @param user
 * @returns
 */
export const hasUserReadAccess = (organization: string, user?: UserSession): boolean => {
	if (!user) {
		// no user info, authentication is not enabled, deny access
		return false;
	}

	if (user.isAdmin) {
		// if user is admin should have access to read all organization
		return true;
	}

	return user.allowedReadOrganizations.includes(organization);
};

/**
 * checks if a user has write access to a specific organization.
 * @param organization
 * @param user
 * @returns
 */
export const hasUserWriteAccess = (organization: string, user?: UserSession): boolean => {
	if (!user) {
		return false;
	}

	if (user.isAdmin) {
		// if user is admin should have access to write all organization
		return true;
	}

	return user.allowedWriteOrganizations.includes(organization);
};
