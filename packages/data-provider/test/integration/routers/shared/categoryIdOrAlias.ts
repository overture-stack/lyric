import { expect } from 'chai';
import { it } from 'mocha';
import type supertest from 'supertest';

/**
 * Shared behaviour spec for any route validating `categoryId` via the shared `categoryIdSchema`
 * (see `utils/schemas.ts`), imported into each router's spec file rather than copy-pasted.
 *
 * Only proves the identifier is *accepted* at the validation layer; each router's happy-path
 * response differs. The actual id-or-alias *resolution* behaviour, including alias-wins-on-
 * collision, is specified once in categoryRouter.spec.ts.
 */
export function itAcceptsCategoryIdOrAliasInPath(
	getApp: () => supertest.Agent,
	pathFor: (categoryId: string) => string,
	makeRequest: (app: supertest.Agent, path: string) => supertest.Test = (app, path) => app.get(path),
) {
	it('should accept a numeric categoryId in the path', async () => {
		const response = await makeRequest(getApp(), pathFor('123'));

		expect(response.status).to.not.equal(400);
	});

	it('should accept an alias in the categoryId path position', async () => {
		const response = await makeRequest(getApp(), pathFor('some-alias'));

		expect(response.status).to.not.equal(400);
	});

	it('should reject a categoryId that is neither a valid id nor a valid alias shape', async () => {
		const response = await makeRequest(getApp(), pathFor('not a valid one'));

		expect(response.status).to.equal(400);
	});
}
