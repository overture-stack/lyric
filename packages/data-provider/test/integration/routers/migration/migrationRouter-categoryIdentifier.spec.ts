import { after, before, describe } from 'mocha';
import supertest from 'supertest';

import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import { itAcceptsCategoryIdOrAliasInPath } from '../shared/categoryIdOrAlias.js';

describe('Integration - Migration Router - categoryId path param accepts id or alias', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.migration);
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	describe('GET /category/:categoryId', () => {
		itAcceptsCategoryIdOrAliasInPath(
			() => app,
			(categoryId) => `/category/${categoryId}`,
		);
	});
});
