import { expect } from 'chai';
import { after, afterEach, before, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import { itAcceptsCategoryIdOrAliasInPath } from '../shared/categoryIdOrAlias.js';

describe('Integration - Audit Router - categoryId path param accepts id or alias', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.audit);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	describe('alias resolution', () => {
		it('should resolve a real alias to its category, reaching the "no records" case rather than "category not found"', async () => {
			const dictionary = await lyricProvider.repositories.dictionary.save({
				dictionary: dictionarySportsData,
				name: 'audit-alias-dictionary',
				version: '1.0.0',
			});
			const category = await lyricProvider.repositories.category.save({
				activeDictionaryId: dictionary.id,
				alias: 'audit-alias',
				name: 'audit-alias-category',
			});

			const response = await app.get(`/category/${category.alias}/organization/test-org`);

			expect(response.status).to.equal(404);
			expect(response.body).to.have.property('message', 'No data found');
		});

		it('should return a category-not-found error for an alias that matches no category', async () => {
			const response = await app.get('/category/no-such-alias/organization/test-org');

			expect(response.status).to.equal(404);
			expect(response.body.message).to.include('not found');
		});
	});

	describe('GET /category/:categoryId/organization/:organization', () => {
		itAcceptsCategoryIdOrAliasInPath(
			() => app,
			(categoryId) => `/category/${categoryId}/organization/test-org`,
		);
	});
});
