import { expect } from 'chai';
import express, { type NextFunction, type Response } from 'express';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { AuthConfig, RequestWithUser, UserSession } from '../../../src/middleware/auth.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import type { SubmittedDataResponse } from '../../../src/utils/types.js';
import { dictionarySportsData } from '../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../dependencies/lyricProvider.js';
import { getContainers } from '../globalSetup.js';

const READABLE_ORGANIZATION = 'readable-org';
const OTHER_ORGANIZATION = 'other-org';

const reader: UserSession = {
	username: 'reader',
	isAdmin: false,
	allowedWriteOrganizations: [],
	allowedReadOrganizations: [READABLE_ORGANIZATION],
};

/** Stands in for a service's auth middleware: sets `req.user` to `user`, or leaves it unset when `user` is omitted. */
const createSetUser =
	(user?: UserSession) =>
	(req: RequestWithUser, _res: Response, next: NextFunction): void => {
		req.user = user;
		next();
	};

/** The organization of each record in an NDJSON stream response. */
const getStreamedOrganizations = (body: string): string[] =>
	body
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line): SubmittedDataResponse => JSON.parse(line))
		.map((record) => record.organization);

/**
 * Defines a suite against the submitted data controllers built with `auth` and mounted without Lyric's router, so no
 * auth middleware runs ahead of them. Before each test, one sport record is saved in each of two organizations; after
 * each test, the database is reset.
 */
const describeWithAuth = (
	title: string,
	auth: AuthConfig,
	defineTests: (getContext: () => { categoryId: number; createApp: (user?: UserSession) => supertest.Agent }) => void,
): void => {
	describe(title, () => {
		let categoryId: number;
		let lyricProvider: LyricProvider;

		const createApp = (user?: UserSession): supertest.Agent => {
			const controller = lyricProvider.controllers.submittedData;
			const app = express();
			app.use(createSetUser(user));
			app.get('/category/:categoryId', controller.getSubmittedDataByCategory);
			app.get('/category/:categoryId/stream', controller.getSubmittedDataByCategoryStream);
			app.use(errorHandler);
			return supertest(app);
		};

		before(async () => {
			lyricProvider = await createLyricProvider({ ...getContainers().providerConfig, auth });
		});

		beforeEach(async () => {
			const dictionary = await lyricProvider.repositories.dictionary.save({
				name: 'sports',
				version: '1.0.0',
				dictionary: dictionarySportsData,
			});
			const category = await lyricProvider.repositories.category.save({
				name: 'sports-category',
				activeDictionaryId: dictionary.id,
			});
			categoryId = category.id;
			await lyricProvider.repositories.submittedData.save(
				[READABLE_ORGANIZATION, OTHER_ORGANIZATION].map((organization, index) => ({
					data: { sport_id: String(index + 1), name: `Sport ${index + 1}` },
					dictionaryCategoryId: category.id,
					entityName: 'sport',
					isValid: true,
					lastValidSchemaId: dictionary.id,
					organization,
					originalSchemaId: dictionary.id,
					systemId: `SPORT-${index + 1}`,
					createdBy: 'test',
					updatedBy: 'test',
				})),
			);
		});

		afterEach(async () => {
			await getContainers().resetDatabases();
		});

		after(async () => {
			await lyricProvider.shutdown();
		});

		defineTests(() => ({ categoryId, createApp }));
	});
};

describe('Integration - Submitted Data Controller - readable organizations', () => {
	describeWithAuth('auth protecting every method', { enabled: true }, (getContext) => {
		it('answers 403 to a request without a user', async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp().get(`/category/${categoryId}`);

			expect(response.status).to.equal(403);
			expect(response.body).to.have.property('error', 'Forbidden');
		});

		it('answers 403 to a stream request without a user', async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp().get(`/category/${categoryId}/stream`);

			expect(response.status).to.equal(403);
			expect(response.body).to.have.property('error', 'Forbidden');
		});

		it("answers a user with only the records of the user's readable organizations", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp(reader).get(`/category/${categoryId}`);

			expect(response.status).to.equal(200);
			expect(response.body.records.map((record: SubmittedDataResponse) => record.organization)).to.eql([
				READABLE_ORGANIZATION,
			]);
		});

		it("streams a user only the records of the user's readable organizations", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp(reader).get(`/category/${categoryId}/stream`).buffer(true);

			expect(response.status).to.equal(200);
			expect(getStreamedOrganizations(response.text)).to.eql([READABLE_ORGANIZATION]);
		});
	});

	describeWithAuth('auth protecting POST only', { enabled: true, protectedMethods: ['POST'] }, (getContext) => {
		it("answers a GET without a user with every organization's records", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp().get(`/category/${categoryId}`);

			expect(response.status).to.equal(200);
			expect(response.body.records.map((record: SubmittedDataResponse) => record.organization)).to.have.members([
				READABLE_ORGANIZATION,
				OTHER_ORGANIZATION,
			]);
		});

		it("answers a GET with a user with only the records of the user's readable organizations", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp(reader).get(`/category/${categoryId}`);

			expect(response.status).to.equal(200);
			expect(response.body.records.map((record: SubmittedDataResponse) => record.organization)).to.eql([
				READABLE_ORGANIZATION,
			]);
		});
	});

	describeWithAuth('auth disabled', { enabled: false }, (getContext) => {
		it("answers a request without a user with every organization's records", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp().get(`/category/${categoryId}`);

			expect(response.status).to.equal(200);
			expect(response.body.records.map((record: SubmittedDataResponse) => record.organization)).to.have.members([
				READABLE_ORGANIZATION,
				OTHER_ORGANIZATION,
			]);
		});

		it("streams a request without a user every organization's records", async () => {
			const { categoryId, createApp } = getContext();

			const response = await createApp().get(`/category/${categoryId}/stream`).buffer(true);

			expect(response.status).to.equal(200);
			expect(getStreamedOrganizations(response.text)).to.have.members([READABLE_ORGANIZATION, OTHER_ORGANIZATION]);
		});
	});
});
