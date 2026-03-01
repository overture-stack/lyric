import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { startContainers, type StartedContainers } from '../../containers.js';
import { createLyricProvider } from '../../lyricProvider.js';
import { createTestApp } from '../../testServer.js';
import { dictionarySportsData } from '../../../unit/utils/fixtures/dictionarySchemasTestData.js';

type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

describe('Integration - Submission Router - POST /category/:categoryId/data', () => {
	let app: supertest.Agent;
	let containers: StartedContainers;
	let lyricProvider: LyricProvider;
	let categoryId: number;

	before(async () => {
		containers = await startContainers();
		lyricProvider = await createLyricProvider(containers.providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
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
	});

	afterEach(async () => {
		await containers.resetDatabases();
	});

	after(async () => {
		await lyricProvider.disconnect();
		await containers.stop();
	});

	it('should return 200 with PROCESSING status and a submissionId when valid records are submitted', async () => {
		const response = await app
			.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
			.send([{ sport_id: '1', name: 'Soccer' }]);

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		expect(response.body).to.have.property('submissionId');
	});

	it('should return 400 when the payload is an empty array', async () => {
		const response = await app.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`).send([]);

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the payload is not an array', async () => {
		const response = await app
			.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
			.send({ sport_id: '1', name: 'Soccer' });

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the category ID is invalid', async () => {
		const response = await app
			.post(`/category/99999/data?entityName=sport&organization=testOrg`)
			.send([{ sport_id: '1', name: 'Soccer' }]);

		expect(response.status).to.equal(400);
	});
});
