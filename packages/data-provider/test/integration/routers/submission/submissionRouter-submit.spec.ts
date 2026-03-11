import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

describe('Integration - Submission Router - POST /category/:categoryId/data', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let processInsertRecordsAsyncStub: sinon.SinonStub;
	let originalCreate: typeof submissionProcessorFactory.create;

	before(async () => {
		// Create a single shared stub so all processor instances (the controller
		// creates its own service independently of provider.services.submission)
		// report calls to the same spy.
		processInsertRecordsAsyncStub = sinon.stub().resolves();

		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);
			processor.processInsertRecordsAsync = processInsertRecordsAsyncStub;
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		processInsertRecordsAsyncStub.resetHistory();
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
		await getContainers().resetDatabases();
	});

	after(async () => {
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.disconnect();
	});

	it('should return 200 with PROCESSING status and a submissionId when valid records are submitted', async () => {
		const response = await app
			.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
			.send([{ sport_id: '1', name: 'Soccer' }]);

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		expect(response.body).to.have.property('submissionId');
		expect(processInsertRecordsAsyncStub.calledOnce).to.be.true;
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
