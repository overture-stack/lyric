import type { UserSession } from '../middleware/auth.js';

/**
 * Retrieves the list of organizations a user has read access to.
 * If the user is an admin, it returns undefined to indicate access to all organizations.
 * If no user information is provided, it also returns undefined to allow all access (assuming authentication is not enabled).
 * Otherwise, it returns the list of organizations the user is allowed to read from.
 * @param organization
 * @param user
 * @returns
 */
export const getUserReadableOrganizations = (user?: UserSession) => {
	if (!user) {
		// no user info, authentication is not enabled, allow all access
		return undefined;
	}

	if (user.isAdmin) {
		// admin has access to all organizations
		return undefined;
	}

	return user.allowedReadOrganizations;
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
