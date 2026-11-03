import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { createTsvFileContent } from '../../../fixtures/createTsvContent.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider, type LyricProviderConfig } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

/** A sport TSV file of about `size` bytes, padded in its name column. */
const createSportTsv = (size: number): Buffer =>
	createTsvFileContent(['sport_id', 'name'], [['1', 'a'.repeat(Math.max(size - 16, 1))]]);

/** Sport records totalling about `size` bytes of JSON. */
const createSportRecords = (size: number): Array<{ sport_id: string; name: string }> => [
	{ sport_id: '1', name: 'a'.repeat(Math.max(size - 32, 1)) },
];

/**
 * Defines a suite against a submission router built with the given auth and body limits, with a sports category
 * saved before each test and the database reset after it.
 */
const describeWithConfig = (
	title: string,
	config: Pick<LyricProviderConfig, 'auth' | 'submissionService'>,
	defineTests: (getContext: () => { app: supertest.Agent; categoryId: number }) => void,
): void => {
	describe(title, () => {
		let app: supertest.Agent;
		let categoryId: number;
		let lyricProvider: LyricProvider;

		before(async () => {
			lyricProvider = await createLyricProvider({ ...getContainers().providerConfig, ...config });
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
			await getContainers().resetDatabases();
		});

		after(async () => {
			await lyricProvider.shutdown();
		});

		defineTests(() => ({ app, categoryId }));
	});
};

describe('Integration - Submission Router - body limits', () => {
	let originalCreate: typeof submissionProcessorFactory.create;

	before(() => {
		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);
			processor.addFilesToSubmissionAsync = sinon.stub().resolves();
			processor.processInsertRecordsAsync = sinon.stub().resolves();
			return processor;
		};
	});

	after(() => {
		submissionProcessorFactory.create = originalCreate;
	});

	describeWithConfig('with a per-file limit of 1KB', { submissionService: { maxFileSize: 1024 } }, (getContext) => {
		it('should respond 413 naming the per-file limit when a file is over it', async () => {
			const { app, categoryId } = getContext();
			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', createSportTsv(2048), 'sport.tsv');

			expect(response.status).to.equal(413);
			expect(response.body).to.have.property('message', 'Each file must be at most 1KB');
		});

		it('should accept a JSON body within the per-file limit', async () => {
			const { app, categoryId } = getContext();
			const response = await app
				.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
				.send(createSportRecords(900));

			expect(response.status).to.equal(200);
		});

		it('should respond 413 naming the per-file limit when a JSON body is over it', async () => {
			const { app, categoryId } = getContext();
			const response = await app
				.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
				.send(createSportRecords(2048));

			expect(response.status).to.equal(413);
			expect(response.body).to.have.property('message', 'JSON request bodies must be at most 1KB');
		});
	});

	describeWithConfig('with maxFileSize set to 0', { submissionService: { maxFileSize: 0 } }, (getContext) => {
		it('should accept an uploaded file', async () => {
			const { app, categoryId } = getContext();
			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', createSportTsv(2048), 'sport.tsv');

			expect(response.status).to.equal(200);
		});

		it('should accept a JSON body', async () => {
			const { app, categoryId } = getContext();
			const response = await app
				.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
				.send(createSportRecords(512));

			expect(response.status).to.equal(200);
		});
	});

	describeWithConfig(
		'with a per-file limit of 2KB and a request limit of 3KB',
		{ submissionService: { maxFileSize: 2048, maxRequestSize: 3072 } },
		(getContext) => {
			it('should accept an upload whose files together are within the request limit', async () => {
				const { app, categoryId } = getContext();
				const response = await app
					.post(`/category/${categoryId}/files?organization=testOrg`)
					.attach('files', createSportTsv(1024), 'sport.tsv');

				expect(response.status).to.equal(200);
			});

			it('should respond 413 naming the request limit when files each within the per-file limit together exceed it', async () => {
				const { app, categoryId } = getContext();
				const response = await app
					.post(`/category/${categoryId}/files?organization=testOrg`)
					.attach('files', createSportTsv(1800), 'sport.tsv')
					.attach('files', createSportTsv(1800), 'sport.tsv');

				expect(response.status).to.equal(413);
				expect(response.body).to.have.property('message', 'Request content must be at most 3KB');
			});

			it('should limit a JSON body by the per-file limit when a request limit is also set', async () => {
				const { app, categoryId } = getContext();
				const withinFileLimit = await app
					.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
					.send(createSportRecords(1536));
				const overFileLimit = await app
					.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
					.send(createSportRecords(2560));

				expect(withinFileLimit.status).to.equal(200);
				expect(overFileLimit.status).to.equal(413);
				expect(overFileLimit.body).to.have.property('message', 'JSON request bodies must be at most 2KB');
			});
		},
	);

	describeWithConfig(
		'with authentication enabled',
		{ auth: { customAuthHandler: () => ({ errorCode: 401, errorMessage: 'Not authenticated' }), enabled: true } },
		(getContext) => {
			it('should authenticate a request before parsing its body', async () => {
				const { app, categoryId } = getContext();
				const response = await app
					.post(`/category/${categoryId}/data?entityName=sport&organization=testOrg`)
					.set('Content-Type', 'application/json')
					.send('{"name": x}');

				expect(response.status).to.equal(401);
			});
		},
	);
});
