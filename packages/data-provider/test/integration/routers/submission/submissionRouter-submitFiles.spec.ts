import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { dictionarySportsData } from '../../../unit/utils/fixtures/dictionarySchemasTestData.js';
import { startContainers, type StartedContainers } from '../../containers.js';
import { createLyricProvider, type LyricProvider } from '../../lyricProvider.js';
import { createTestApp } from '../../testServer.js';

function createTsvContent(headers: string[], rows: string[][]): Buffer {
	const lines = [headers.join('\t'), ...rows.map((row) => row.join('\t'))];
	return Buffer.from(lines.join('\n'));
}

describe('Integration - Submission Router - POST /category/:categoryId/files', () => {
	let app: supertest.Agent;
	let containers: StartedContainers;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let addFilesToSubmissionAsyncStub: sinon.SinonStub;
	let originalCreate: typeof submissionProcessorFactory.create;

	before(async () => {
		containers = await startContainers();

		addFilesToSubmissionAsyncStub = sinon.stub().resolves();

		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);
			processor.addFilesToSubmissionAsync = addFilesToSubmissionAsyncStub;
			return processor;
		};

		lyricProvider = await createLyricProvider(containers.providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		addFilesToSubmissionAsyncStub.resetHistory();
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
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.disconnect();
		await containers.stop();
	});

	it('should return 200 with PROCESSING status when a valid TSV file is uploaded', async () => {
		const tsvContent = createTsvContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', tsvContent, 'sport.tsv');

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		expect(response.body).to.have.property('submissionId');
		expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
	});

	it('should return 200 with PROCESSING status when a valid CSV file is uploaded', async () => {
		const csvContent = Buffer.from('sport_id,name\n1,Soccer');

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', csvContent, 'sport.csv');

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		expect(response.body).to.have.property('submissionId');
		expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
	});

	it('should return 200 with PROCESSING status and list both entities when multiple files are uploaded', async () => {
		const sportTsv = createTsvContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', sportTsv, 'sport.tsv')
			.attach('files', teamTsv, 'team.tsv');

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('status', 'PROCESSING');
		expect(response.body.inProcessEntities).to.include.members(['sport', 'team']);
		expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
	});

	it('should return 400 when no files are uploaded', async () => {
		const response = await app.post(`/category/${categoryId}/files?organization=testOrg`);

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the uploaded file has an unsupported extension', async () => {
		const fileContent = Buffer.from('sport_id,name\n1,Soccer');

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', fileContent, 'sport.xlsx');

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the category ID is invalid', async () => {
		const tsvContent = createTsvContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const response = await app
			.post(`/category/99999/files?organization=testOrg`)
			.attach('files', tsvContent, 'sport.tsv');

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the organization query param is missing', async () => {
		const tsvContent = createTsvContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const response = await app.post(`/category/${categoryId}/files`).attach('files', tsvContent, 'sport.tsv');

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the filename does not match any entity in the dictionary', async () => {
		const tsvContent = createTsvContent(['field_one', 'field_two'], [['value1', 'value2']]);

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', tsvContent, 'unknown_entity.tsv');

		expect(response.status).to.equal(400);
	});
});
