import type { UserSession } from '../middleware/auth.js';

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

/**
 * retrieves the list of organizations a user has read access to.
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
