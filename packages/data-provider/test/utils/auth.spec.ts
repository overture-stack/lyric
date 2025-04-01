import { expect } from 'chai';
import { describe, it } from 'mocha';

import { UserSession } from '../../src/middleware/auth.js';
import { hasUserWriteAccess } from '../../src/utils/authUtils.js';

describe('Auth utils', () => {
	it('should return false if user is not provided', () => {
		const result = hasUserWriteAccess('org1');
		expect(result).to.eql(false);
	});

	it('should return false if user is not an admin and not allowed to write to the organization', () => {
		const user: UserSession = {
			username: 'John Doe',
			isAdmin: false,
			allowedWriteOrganizations: ['org2'],
		};
		const result = hasUserWriteAccess('org1', user);
		expect(result).to.eql(false);
	});

	it('should return true if user is not an admin but is allowed to write to the organization', () => {
		const user: UserSession = {
			username: 'John Doe',
			isAdmin: false,
			allowedWriteOrganizations: ['org1', 'org3'],
		};
		const result = hasUserWriteAccess('org1', user);
		expect(result).to.eql(true);
	});

	it('should return true if user is an admin', () => {
		const user: UserSession = {
			username: 'John Doe',
			isAdmin: true,
			allowedWriteOrganizations: ['org1', 'org2'],
		};
		const result = hasUserWriteAccess('org1', user);
		expect(result).to.eql(true);
	});

	it('should return false if user is admin and allowedWriteOrganizations does not include the organization', () => {
		const user: UserSession = {
			username: 'John Doe',
			isAdmin: true,
			allowedWriteOrganizations: ['org1', 'org2'],
		};
		const result = hasUserWriteAccess('org3', user);
		expect(result).to.eql(true);
	});
});
