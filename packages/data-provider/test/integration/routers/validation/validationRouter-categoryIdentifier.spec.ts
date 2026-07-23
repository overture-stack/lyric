import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import { itAcceptsCategoryIdOrAliasInPath } from '../shared/categoryIdOrAlias.js';

describe('Integration - Validation Router - categoryId path param accepts id or alias', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;

	before(async () => {
		lyricProvider = await createLyricProvider({
			...getContainers().providerConfig,
			// Matches the literal values the shared helper below exercises ('123', 'some-alias'), so
			// the "is validation enabled" gate doesn't itself 400 before categoryId is considered.
			validator: [
				{ categoryId: '123', entityName: 'some-entity', fieldName: 'some-field' },
				{ categoryId: 'some-alias', entityName: 'some-entity', fieldName: 'some-field' },
			],
		});
		app = createTestApp(lyricProvider.routers.validator);
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	describe('GET /category/:categoryId/entity/:entityName/exists', () => {
		itAcceptsCategoryIdOrAliasInPath(
			() => app,
			// organization/value are required here so a missing-query 400 isn't mistaken for a
			// categoryId rejection.
			(categoryId) => `/category/${categoryId}/entity/some-entity/exists?organization=test-org&value=x`,
		);
	});

	describe('alias resolution, both at the URL and in VALIDATOR_CONFIG', () => {
		// `ValidatorEntry.categoryId` matches the URL's categoryId by string equality
		// (`findValidatorEntry`): whichever representation VALIDATOR_CONFIG uses, the request
		// must use the same one.
		let categoryId: number;
		let categoryAlias: string;

		// beforeEach, not before: afterEach resets the DB after every test, so the seed must repeat.
		beforeEach(async () => {
			const dictionary = await lyricProvider.repositories.dictionary.save({
				dictionary: dictionarySportsData,
				name: 'validation-alias-dictionary',
				version: '1.0.0',
			});
			const category = await lyricProvider.repositories.category.save({
				activeDictionaryId: dictionary.id,
				alias: 'validation-alias',
				name: 'validation-alias-category',
			});
			categoryId = category.id;
			categoryAlias = category.alias as string;
		});

		afterEach(async () => {
			await getContainers().resetDatabases();
		});

		it('should resolve the category and reach the underlying record check when VALIDATOR_CONFIG and the request both use the numeric id', async () => {
			const lyricProviderWithValidator = await createLyricProvider({
				...getContainers().providerConfig,
				validator: [{ categoryId, entityName: 'some-entity', fieldName: 'some-field' }],
			});
			const appWithValidator = createTestApp(lyricProviderWithValidator.routers.validator);

			const response = await appWithValidator.get(
				`/category/${categoryId}/entity/some-entity/exists?organization=test-org&value=x`,
			);

			// Not "category not found" and not "validation not enabled": it got past both,
			// meaning the numeric id resolved correctly and the record check itself ran.
			expect(response.body.message).to.equal('The specified value was not found.');

			await lyricProviderWithValidator.shutdown();
		});

		it('should resolve the category and reach the underlying record check when VALIDATOR_CONFIG and the request both use the alias', async () => {
			const lyricProviderWithValidator = await createLyricProvider({
				...getContainers().providerConfig,
				validator: [{ categoryId: categoryAlias, entityName: 'some-entity', fieldName: 'some-field' }],
			});
			const appWithValidator = createTestApp(lyricProviderWithValidator.routers.validator);

			const response = await appWithValidator.get(
				`/category/${categoryAlias}/entity/some-entity/exists?organization=test-org&value=x`,
			);

			expect(response.body.message).to.equal('The specified value was not found.');

			await lyricProviderWithValidator.shutdown();
		});

		it('should not find a matching validator entry when VALIDATOR_CONFIG and the request use different representations of the same category', async () => {
			const lyricProviderWithValidator = await createLyricProvider({
				...getContainers().providerConfig,
				validator: [{ categoryId, entityName: 'some-entity', fieldName: 'some-field' }],
			});
			const appWithValidator = createTestApp(lyricProviderWithValidator.routers.validator);

			const response = await appWithValidator.get(
				`/category/${categoryAlias}/entity/some-entity/exists?organization=test-org&value=x`,
			);

			expect(response.status).to.equal(400);
			expect(response.body.message).to.include('Validation is not enabled');

			await lyricProviderWithValidator.shutdown();
		});
	});
});
