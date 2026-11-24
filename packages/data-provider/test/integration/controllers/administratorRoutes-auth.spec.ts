import { expect } from 'chai';
import express, { json, type NextFunction, type Request, type Response } from 'express';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { AuthConfig, RequestWithUser, UserSession, UserSessionResult } from '../../../src/middleware/auth.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import { dictionarySportsData } from '../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../dependencies/lyricProvider.js';
import { getContainers } from '../globalSetup.js';
import { VALID_DICTIONARY_NAME, VALID_DICTIONARY_VERSION } from '../routers/dictionary/fixtures.js';

const EXISTING_ALIAS = 'existing-alias';
const NEW_ALIAS = 'new-alias';
const REGISTERED_CATEGORY_NAME = 'registered-category';

const administrator: UserSession = {
	allowedReadOrganizations: [],
	allowedWriteOrganizations: [],
	isAdmin: true,
	username: 'administrator',
};

const writer: UserSession = {
	allowedReadOrganizations: ['test-org'],
	allowedWriteOrganizations: ['test-org'],
	isAdmin: false,
	username: 'writer',
};

const usersByName: Record<string, UserSession> = { administrator, writer };

/** Stands in for a service's auth handler: authenticates the user named by the `x-test-user` header. */
const authenticateTestUser = (req: Request): UserSessionResult => {
	const user = usersByName[String(req.headers['x-test-user'])];
	return user ? { user } : { errorCode: 401, errorMessage: 'No credentials' };
};

/** Stands in for a service's own auth middleware ahead of a controller: sets `req.user` to `user`, or leaves it unset. */
const createSetUser =
	(user?: UserSession) =>
	(req: RequestWithUser, _res: Response, next: NextFunction): void => {
		req.user = user;
		next();
	};

type Context = {
	aliasedCategoryId: number;
	createControllerApp: (user?: UserSession) => supertest.Agent;
	lyricProvider: LyricProvider;
	routerApp: supertest.Agent;
	unaliasedCategoryId: number;
};

type AdministratorRoute = {
	/** Asserts that the route's write did not happen. */
	expectUnchanged: (context: Context) => Promise<void>;
	name: string;
	send: (agent: supertest.Agent, context: Context) => supertest.Test;
};

const administratorRoutes: AdministratorRoute[] = [
	{
		expectUnchanged: async ({ lyricProvider }) => {
			const category = await lyricProvider.repositories.category.getCategoryByName(REGISTERED_CATEGORY_NAME);
			expect(category).to.equal(undefined);
		},
		name: 'dictionary registration',
		send: (agent) =>
			agent.post('/dictionary/register').send({
				categoryName: REGISTERED_CATEGORY_NAME,
				dictionaryName: VALID_DICTIONARY_NAME,
				dictionaryVersion: VALID_DICTIONARY_VERSION,
			}),
	},
	{
		expectUnchanged: async ({ lyricProvider, unaliasedCategoryId }) => {
			const category = await lyricProvider.repositories.category.getCategoryById(unaliasedCategoryId);
			expect(category?.alias).to.equal(null);
		},
		name: 'alias assignment',
		send: (agent, { unaliasedCategoryId }) =>
			agent.put(`/category/${unaliasedCategoryId}/alias`).send({ alias: NEW_ALIAS }),
	},
	{
		expectUnchanged: async ({ aliasedCategoryId, lyricProvider }) => {
			const category = await lyricProvider.repositories.category.getCategoryById(aliasedCategoryId);
			expect(category?.alias).to.equal(EXISTING_ALIAS);
		},
		name: 'alias removal',
		send: (agent, { aliasedCategoryId }) => agent.delete(`/category/${aliasedCategoryId}/alias`),
	},
];

/**
 * Defines a suite against dictionary registration and the category alias routes, with Lyric built with `auth`. Each test
 * can reach them through Lyric's routers, authenticated by `authenticateTestUser`, or through `provider().controllers`
 * mounted without Lyric's router. Before each test, the dictionary to register is seeded in the schema service, and two
 * categories are saved, one with an alias and one without; after each test, the databases are reset.
 */
const describeWithAuth = (title: string, auth: AuthConfig, defineTests: (getContext: () => Context) => void): void => {
	describe(title, () => {
		let context: Context;
		let lyricProvider: LyricProvider;

		const createControllerApp = (user?: UserSession): supertest.Agent => {
			const app = express();
			app.use(json());
			app.use(createSetUser(user));
			app.post('/dictionary/register', lyricProvider.controllers.dictionary.registerDictionary);
			app.put('/category/:categoryId/alias', lyricProvider.controllers.category.assignAlias);
			app.delete('/category/:categoryId/alias', lyricProvider.controllers.category.unassignAlias);
			app.use(errorHandler);
			return supertest(app);
		};

		before(async () => {
			lyricProvider = await createLyricProvider({
				...getContainers().providerConfig,
				auth: { ...auth, customAuthHandler: authenticateTestUser },
			});
		});

		beforeEach(async () => {
			const schemaServiceResponse = await fetch(`${getContainers().providerConfig.schemaService.url}/dictionaries`, {
				body: JSON.stringify({
					name: VALID_DICTIONARY_NAME,
					schemas: dictionarySportsData,
					version: VALID_DICTIONARY_VERSION,
				}),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			});
			expect(schemaServiceResponse.status, 'Failed to seed the dictionary in the schema service').to.equal(200);

			const dictionary = await lyricProvider.repositories.dictionary.save({
				dictionary: dictionarySportsData,
				name: 'seeded-dictionary',
				version: '1.0.0',
			});
			const aliasedCategory = await lyricProvider.repositories.category.save({
				activeDictionaryId: dictionary.id,
				alias: EXISTING_ALIAS,
				name: 'aliased-category',
			});
			const unaliasedCategory = await lyricProvider.repositories.category.save({
				activeDictionaryId: dictionary.id,
				name: 'unaliased-category',
			});

			const routerApp = express();
			routerApp.use('/dictionary', lyricProvider.routers.dictionary);
			routerApp.use('/category', lyricProvider.routers.category);
			routerApp.use(errorHandler);

			context = {
				aliasedCategoryId: aliasedCategory.id,
				createControllerApp,
				lyricProvider,
				routerApp: supertest(routerApp),
				unaliasedCategoryId: unaliasedCategory.id,
			};
		});

		afterEach(async () => {
			await getContainers().resetDatabases();
		});

		after(async () => {
			await lyricProvider.shutdown();
		});

		defineTests(() => context);
	});
};

describe('Integration - Administrator routes - dictionary registration and category aliases', () => {
	describeWithAuth('auth protecting every method', { enabled: true }, (getContext) => {
		administratorRoutes.forEach((route) => {
			it(`accepts ${route.name} by an administrator, through Lyric's routers`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context).set('x-test-user', 'administrator');

				expect(response.status).to.equal(200);
			});

			it(`answers 403 to ${route.name} by a user who is not an administrator, through Lyric's routers`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context).set('x-test-user', 'writer');

				expect(response.status).to.equal(403);
				expect(response.body).to.have.property('error', 'Forbidden');
				await route.expectUnchanged(context);
			});

			it(`accepts ${route.name} by an administrator, through provider().controllers`, async () => {
				const context = getContext();

				const response = await route.send(context.createControllerApp(administrator), context);

				expect(response.status).to.equal(200);
			});

			it(`answers 403 to ${route.name} by a user who is not an administrator, through provider().controllers`, async () => {
				const context = getContext();

				const response = await route.send(context.createControllerApp(writer), context);

				expect(response.status).to.equal(403);
				expect(response.body).to.have.property('error', 'Forbidden');
				await route.expectUnchanged(context);
			});

			it(`answers 403 to ${route.name} without a user, through provider().controllers`, async () => {
				const context = getContext();

				const response = await route.send(context.createControllerApp(), context);

				expect(response.status).to.equal(403);
				expect(response.body).to.have.property('error', 'Forbidden');
				await route.expectUnchanged(context);
			});
		});
	});

	describeWithAuth('auth protecting GET only', { enabled: true, protectedMethods: ['GET'] }, (getContext) => {
		administratorRoutes.forEach((route) => {
			it(`answers 401 to ${route.name} without credentials, through Lyric's routers, regardless of protectedMethods`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context);

				expect(response.status).to.equal(401);
				expect(response.body).to.have.property('error', 'Unauthorized');
				await route.expectUnchanged(context);
			});

			it(`answers 403 to ${route.name} by a user who is not an administrator, through Lyric's routers, regardless of protectedMethods`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context).set('x-test-user', 'writer');

				expect(response.status).to.equal(403);
				expect(response.body).to.have.property('error', 'Forbidden');
				await route.expectUnchanged(context);
			});

			it(`accepts ${route.name} by an administrator, through Lyric's routers, regardless of protectedMethods`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context).set('x-test-user', 'administrator');

				expect(response.status).to.equal(200);
			});

			it(`answers 403 to ${route.name} by a user who is not an administrator, through provider().controllers, regardless of protectedMethods`, async () => {
				const context = getContext();

				const response = await route.send(context.createControllerApp(writer), context);

				expect(response.status).to.equal(403);
				expect(response.body).to.have.property('error', 'Forbidden');
				await route.expectUnchanged(context);
			});
		});
	});

	describeWithAuth('auth disabled', { enabled: false }, (getContext) => {
		administratorRoutes.forEach((route) => {
			it(`accepts ${route.name} without a user, through Lyric's routers`, async () => {
				const context = getContext();

				const response = await route.send(context.routerApp, context);

				expect(response.status).to.equal(200);
			});

			it(`accepts ${route.name} without a user, through provider().controllers`, async () => {
				const context = getContext();

				const response = await route.send(context.createControllerApp(), context);

				expect(response.status).to.equal(200);
			});
		});
	});
});
