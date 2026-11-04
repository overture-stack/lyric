import { expect } from 'chai';
import { describe, it } from 'mocha';

import { type AuthConfig, UserSession } from '../../../src/middleware/auth.js';
import { getUserReadableOrganizations, hasUserWriteAccess } from '../../../src/utils/authUtils.js';
import { Forbidden } from '../../../src/utils/errors.js';

describe('Auth utils - getUserReadableOrganizations', () => {
	const reader: UserSession = {
		username: 'reader',
		isAdmin: false,
		allowedWriteOrganizations: [],
		allowedReadOrganizations: ['org1', 'org2'],
	};
	const admin: UserSession = { ...reader, isAdmin: true };
	const authOnEveryMethod: AuthConfig = { enabled: true };
	const authOnPostOnly: AuthConfig = { enabled: true, protectedMethods: ['POST'] };

	it("returns the user's readable organizations for a user who is not an admin", () => {
		const result = getUserReadableOrganizations({ method: 'GET', user: reader }, authOnEveryMethod);
		expect(result).to.eql(['org1', 'org2']);
	});

	it('returns undefined, meaning every organization, for an admin', () => {
		const result = getUserReadableOrganizations({ method: 'GET', user: admin }, authOnEveryMethod);
		expect(result).to.equal(undefined);
	});

	it("returns the user's readable organizations on a method auth does not protect", () => {
		const result = getUserReadableOrganizations({ method: 'GET', user: reader }, authOnPostOnly);
		expect(result).to.eql(['org1', 'org2']);
	});

	it('returns undefined, meaning every organization, for a request without a user when auth is disabled', () => {
		const result = getUserReadableOrganizations({ method: 'GET' }, { enabled: false });
		expect(result).to.equal(undefined);
	});

	it('returns undefined, meaning every organization, for a request without a user on a method auth does not protect', () => {
		const result = getUserReadableOrganizations({ method: 'GET' }, authOnPostOnly);
		expect(result).to.equal(undefined);
	});

	it('throws Forbidden for a request without a user when auth protects every method', () => {
		expect(() => getUserReadableOrganizations({ method: 'GET' }, authOnEveryMethod)).to.throw(Forbidden);
	});

	it('throws Forbidden for a request without a user on a method auth protects', () => {
		const authOnGet: AuthConfig = { enabled: true, protectedMethods: ['GET'] };
		expect(() => getUserReadableOrganizations({ method: 'GET' }, authOnGet)).to.throw(Forbidden);
	});
});

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
