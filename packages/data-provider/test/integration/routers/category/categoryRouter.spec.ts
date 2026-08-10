import { expect } from 'chai';
import { after, afterEach, before, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

describe('Integration - Category Router', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.category);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	const seedCategory = async (name: string, alias?: string) => {
		const dictionary = await lyricProvider.repositories.dictionary.save({
			dictionary: dictionarySportsData,
			name: `dictionary-for-${name}`,
			version: '1.0.0',
		});

		return lyricProvider.repositories.category.save({
			activeDictionaryId: dictionary.id,
			alias,
			name,
		});
	};

	describe('GET /', () => {
		it('should include the alias of categories that have one', async () => {
			await seedCategory('aliased-category', 'donor');

			const response = await app.get('/');

			expect(response.status).to.equal(200);
			const found = response.body.find((c: { name: string }) => c.name === 'aliased-category');
			expect(found).to.have.property('alias', 'donor');
		});

		it('should not set an alias field for categories that have none', async () => {
			await seedCategory('unaliased-category');

			const response = await app.get('/');

			expect(response.status).to.equal(200);
			const found = response.body.find((c: { name: string }) => c.name === 'unaliased-category');
			expect(found?.alias).to.be.undefined;
		});
	});

	describe('GET /:categoryId', () => {
		it('should include the alias in category details when one is set', async () => {
			const category = await seedCategory('aliased-category-details', 'mutation');

			const response = await app.get(`/${category.id}`);

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('alias', 'mutation');
		});

		it('should omit the alias in category details when none is set', async () => {
			const category = await seedCategory('unaliased-category-details');

			const response = await app.get(`/${category.id}`);

			expect(response.status).to.equal(200);
			expect(response.body.alias).to.be.undefined;
		});

		it('should resolve a category by its alias instead of its numeric id', async () => {
			const category = await seedCategory('lookup-by-alias', 'expression');

			const response = await app.get('/expression');

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('id', category.id);
		});

		it("should prioritize the numeric id match when another category's alias collides with it, so a category's own id can never become unreachable", async () => {
			// categoryA's alias is numerically identical to categoryB's real id
			const categoryB = await seedCategory('collision-id-owner');
			const categoryA = await seedCategory('collision-alias-owner', String(categoryB.id));

			const response = await app.get(`/${categoryB.id}`);

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('id', categoryB.id);
		});

		it('should return the same not-found error for an unmatched alias as for an unmatched numeric id', async () => {
			const response = await app.get('/no-such-alias');

			expect(response.status).to.equal(404);
			expect(response.body).to.have.property('message', "Category 'no-such-alias' not found");
		});
	});

	describe('PUT /:categoryId/alias', () => {
		it('should assign an alias to a category that has none', async () => {
			const category = await seedCategory('never-had-an-alias');

			const response = await app.put(`/${category.id}/alias`).send({ alias: 'donor' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('alias', 'donor');
		});

		it('should succeed as a no-op when the category already has the exact same alias, since a retried PUT is idempotent', async () => {
			const category = await seedCategory('already-aliased', 'donor');

			const response = await app.put(`/${category.id}/alias`).send({ alias: 'donor' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('alias', 'donor');
		});

		it('should reject changing an already-set alias to a different value, since rename is not yet supported', async () => {
			const category = await seedCategory('already-aliased-different', 'donor');

			const response = await app.put(`/${category.id}/alias`).send({ alias: 'mutation' });

			expect(response.status).to.equal(400);
		});

		it('should reject an alias already used by a different category', async () => {
			await seedCategory('alias-owner', 'donor');
			const category = await seedCategory('wants-taken-alias');

			const response = await app.put(`/${category.id}/alias`).send({ alias: 'donor' });

			expect(response.status).to.equal(409);
		});

		it('should reject an alias that fails the format check', async () => {
			const category = await seedCategory('rejects-bad-format');

			const response = await app.put(`/${category.id}/alias`).send({ alias: 'not a valid alias!' });

			expect(response.status).to.equal(400);
		});

		it('should reject an empty alias', async () => {
			const category = await seedCategory('rejects-empty-alias');

			const response = await app.put(`/${category.id}/alias`).send({ alias: '' });

			expect(response.status).to.equal(400);
		});

		it('should return not found for a category that does not exist', async () => {
			const response = await app.put('/999999/alias').send({ alias: 'donor' });

			expect(response.status).to.equal(404);
		});

		it('should resolve the target category by its existing alias, not only by numeric id', async () => {
			const category = await seedCategory('addressed-by-alias', 'donor');

			const response = await app.put('/donor/alias').send({ alias: 'donor' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('id', category.id);
		});
	});

	describe('DELETE /:categoryId/alias', () => {
		it('should clear an existing alias', async () => {
			const category = await seedCategory('has-an-alias-to-clear', 'donor');

			const response = await app.delete(`/${category.id}/alias`);

			expect(response.status).to.equal(200);
			expect(response.body.alias).to.be.undefined;
		});

		it('should succeed as a no-op when the category already has no alias', async () => {
			const category = await seedCategory('nothing-to-clear');

			const response = await app.delete(`/${category.id}/alias`);

			expect(response.status).to.equal(200);
			expect(response.body.alias).to.be.undefined;
		});

		it('should return not found for a category that does not exist', async () => {
			const response = await app.delete('/999999/alias');

			expect(response.status).to.equal(404);
		});

		it('should free the alias for a different category to take, once cleared', async () => {
			const original = await seedCategory('original-owner', 'donor');
			await app.delete(`/${original.id}/alias`);
			const newOwner = await seedCategory('new-owner');

			const response = await app.put(`/${newOwner.id}/alias`).send({ alias: 'donor' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('alias', 'donor');
		});
	});
});
