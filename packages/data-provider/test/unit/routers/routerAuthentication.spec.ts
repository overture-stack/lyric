import { expect } from 'chai';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Router } from 'express';
import { after, describe, it } from 'mocha';
import pg from 'pg';

import * as schema from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../../../src/config/config.js';
import { getLogger } from '../../../src/config/logger.js';
import { type AuthConfig, isAuthMiddleware } from '../../../src/middleware/auth.js';
import { createRouters } from '../../../src/routers/createRouters.js';

type RouteHandlers = { handlers: unknown[]; name: string };

/** The routes registered on `router`, each named by its method and path, with the handlers it runs, in order. */
const getRoutes = (router: Router): RouteHandlers[] =>
	router.stack.flatMap(({ route }) =>
		route
			? [
					{
						handlers: route.stack.map(({ handle }) => handle),
						name: `${route.stack[0]?.method.toUpperCase() ?? ''} ${route.path}`,
					},
				]
			: [],
	);

// Building the routers opens no database connection: the pool connects on a first query, and no route runs here.
const pool = new pg.Pool();

const baseDependencies: BaseDependencies = {
	db: drizzle(pool, { schema }),
	idService: { customAlphabet: 'abcdef', customSize: 8, useLocal: true },
	logger: getLogger({ level: 'error' }),
	schemaService: { url: 'http://localhost' },
	submissionService: {},
	workerPool: {
		commitSubmission: () => Promise.resolve(),
		dataValidation: () => Promise.resolve(),
		dictionaryMigration: () => Promise.resolve(),
		terminate: () => Promise.resolve(),
	},
};

const authConfig: AuthConfig = { enabled: true };

const routers = createRouters({ authConfig, baseDependencies, validatorConfig: [] });

describe('Routers - authentication on every route', () => {
	after(async () => {
		await pool.end();
	});

	Object.entries(routers).forEach(([routerName, router]) => {
		it(`runs Lyric's auth middleware first on every route of the ${routerName} router`, () => {
			const routes = getRoutes(router);

			const unauthenticated = routes.filter(({ handlers }) => !isAuthMiddleware(handlers[0])).map(({ name }) => name);

			expect(routes).to.not.be.empty;
			expect(unauthenticated).to.eql([]);
		});
	});

	it('runs no middleware across the submission router, so each of its routes authenticates before parsing a body', () => {
		const routerWideMiddleware = routers.submission.stack.filter(({ route }) => !route).map(({ name }) => name);

		expect(routerWideMiddleware).to.eql([]);
	});
});
