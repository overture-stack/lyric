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

		it('should prioritize the alias match when a numeric id string collides with another category\'s alias', async () => {
			// category A's alias is numerically identical to category B's real id
			const categoryB = await seedCategory('collision-id-owner');
			const categoryA = await seedCategory('collision-alias-owner', String(categoryB.id));

			const response = await app.get(`/${categoryB.id}`);

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('id', categoryA.id);
		});

		it('should return the same not-found error for an unmatched alias as for an unmatched numeric id', async () => {
			const response = await app.get('/no-such-alias');

			expect(response.status).to.equal(400);
			expect(response.body).to.have.property('message', 'Category not found');
		});
	});
});
