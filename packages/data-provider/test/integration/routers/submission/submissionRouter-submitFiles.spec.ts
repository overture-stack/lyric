import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';
import supertest from 'supertest';

import submissionProcessorFactory from '../../../../src/services/submission/submissionProcessor.js';
import { createTsvFileContent } from '../../../fixtures/createTsvContent.js';
import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

/**
 * These tests are only checking the router input validation and ensuring that the submission controller initiates
 * the submission validation process. The actual submission is stubbed so we don't need to wait for it to execute
 * before running the next test. There is a second file that tests submission persistence to ensure that the file
 * content is processed, validated, and added to the database correctly.
 */
describe('Integration - Submission Router - POST /category/:categoryId/files', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let addFilesToSubmissionAsyncStub: sinon.SinonStub;
	let originalCreate: typeof submissionProcessorFactory.create;

	before(async () => {
		addFilesToSubmissionAsyncStub = sinon.stub().resolves();

		originalCreate = submissionProcessorFactory.create;
		submissionProcessorFactory.create = (dependencies) => {
			const processor = originalCreate(dependencies);
			processor.addFilesToSubmissionAsync = addFilesToSubmissionAsyncStub;
			return processor;
		};

		lyricProvider = await createLyricProvider(getContainers().providerConfig);
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
		await getContainers().resetDatabases();
	});

	after(async () => {
		submissionProcessorFactory.create = originalCreate;
		await lyricProvider.disconnect();
	});

	it('should return 200 with PROCESSING status when a valid TSV file is uploaded', async () => {
		const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

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
		const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
		const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);

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
		const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const response = await app
			.post(`/category/99999/files?organization=testOrg`)
			.attach('files', tsvContent, 'sport.tsv');

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the organization query param is missing', async () => {
		const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);

		const response = await app.post(`/category/${categoryId}/files`).attach('files', tsvContent, 'sport.tsv');

		expect(response.status).to.equal(400);
	});

	it('should return 400 when the filename does not match any entity in the dictionary', async () => {
		const tsvContent = createTsvFileContent(['field_one', 'field_two'], [['value1', 'value2']]);

		const response = await app
			.post(`/category/${categoryId}/files?organization=testOrg`)
			.attach('files', tsvContent, 'unknown_entity.tsv');

		expect(response.status).to.equal(400);
	});

	describe('with fileEntityMap', () => {
		it('should return 200 with PROCESSING status when a file with a non-matching filename is mapped to an entity', async () => {
			const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const fileEntityMap = JSON.stringify({ filename: 'sport_data.tsv', entity: 'sport' });

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', tsvContent, 'sport_data.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PROCESSING');
			expect(response.body.inProcessEntities).to.include('sport');
			expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
		});

		it('should use the mapped entity instead of the filename when the fileEntityMap overrides the name', async () => {
			// File is named 'team.tsv' but the map says it contains 'sport' data
			const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const fileEntityMap = JSON.stringify([{ filename: 'team.tsv', entity: 'sport' }]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', tsvContent, 'team.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PROCESSING');
			expect(response.body.inProcessEntities).to.include('sport');
			expect(response.body.inProcessEntities).to.not.include('team');
			expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
		});

		it('should return 200 when multiple files are mapped to the same entity', async () => {
			const batch1 = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const batch2 = createTsvFileContent(['sport_id', 'name'], [['2', 'Basketball']]);
			const fileEntityMap = JSON.stringify([
				{ filename: 'sports_batch1.tsv', entity: 'sport' },
				{ filename: 'sports_batch2.tsv', entity: 'sport' },
			]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', batch1, 'sports_batch1.tsv')
				.attach('files', batch2, 'sports_batch2.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PROCESSING');
			expect(response.body.inProcessEntities).to.include('sport');
			expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
		});

		it('should return 200 when some files use the fileEntityMap and others match by filename', async () => {
			const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const teamTsv = createTsvFileContent(['team_id', 'sport_id', 'name'], [['1', '1', 'Team A']]);
			const fileEntityMap = JSON.stringify([{ filename: 'team_data.tsv', entity: 'team' }]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', sportTsv, 'sport.tsv')
				.attach('files', teamTsv, 'team_data.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PROCESSING');
			expect(response.body.inProcessEntities).to.include.members(['sport', 'team']);
			expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
		});

		it('should return 400 when the fileEntityMap references an entity that does not exist in the dictionary', async () => {
			const tsvContent = createTsvFileContent(['field_one', 'field_two'], [['value1', 'value2']]);
			const fileEntityMap = JSON.stringify([{ filename: 'data.tsv', entity: 'unknown_entity' }]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', tsvContent, 'data.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(400);
		});

		it('should return 200 with batch errors when one file is valid and another maps to an unknown entity', async () => {
			const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const invalidData = createTsvFileContent(['field_one', 'field_two'], [['value1', 'value2']]);
			const fileEntityMap = JSON.stringify([{ filename: 'invalid_data.tsv', entity: 'unknown_entity' }]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', sportTsv, 'sport.tsv')
				.attach('files', invalidData, 'invalid_data.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(200);
			expect(response.body.batchErrors).to.have.length.greaterThan(0);
			expect(response.body.inProcessEntities).to.include('sport');
			expect(addFilesToSubmissionAsyncStub.calledOnce).to.be.true;
		});

		it('should return 400 when the same filename is mapped to multiple different entities', async () => {
			const tsvContent = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const fileEntityMap = JSON.stringify([
				{ filename: 'data.tsv', entity: 'sport' },
				{ filename: 'data.tsv', entity: 'team' },
			]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', tsvContent, 'data.tsv')
				.attach('fileEntityMap', Buffer.from(fileEntityMap), { filename: 'blob', contentType: 'application/json' });

			expect(response.status).to.equal(400);
		});

		it('should return 400 when a single file is uploaded with invalid headers', async () => {
			const tsvContent = createTsvFileContent(['sport_id', 'invalid_header'], [['1', 'Soccer']]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', tsvContent, 'sport.tsv');

			expect(response.status).to.equal(400);
			expect(response.body).to.have.property('status', 'INVALID_SUBMISSION');
			expect(response.body.batchErrors?.length).to.equal(1);
		});

		it('should return 400 when multiple files are uploaded with invalid headers', async () => {
			const sportTsv = createTsvFileContent(['sport_id', 'invalid_header'], [['1', 'Soccer']]);
			const teamTsv = createTsvFileContent(['team_id', 'inbalid_header', 'name'], [['1', '1', 'Team A']]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', sportTsv, 'sport.tsv')
				.attach('files', teamTsv, 'team.tsv');

			expect(response.status).to.equal(400);
			expect(response.body).to.have.property('status', 'INVALID_SUBMISSION');
			expect(response.body.batchErrors?.length).to.equal(2);
		});

		it('should return 200 when multiple files are uploaded some with valid and some with invalid headers', async () => {
			const sportTsv = createTsvFileContent(['sport_id', 'name'], [['1', 'Soccer']]);
			const teamTsv = createTsvFileContent(['team_id', 'inbalid_header', 'name'], [['1', '1', 'Team A']]);

			const response = await app
				.post(`/category/${categoryId}/files?organization=testOrg`)
				.attach('files', sportTsv, 'sport.tsv')
				.attach('files', teamTsv, 'team.tsv');

			expect(response.status).to.equal(200);
			expect(response.body).to.have.property('status', 'PARTIAL_SUBMISSION');
			expect(response.body.batchErrors?.length).to.equal(1);
			expect(response.body.inProcessEntities?.length).to.equal(1);
		});
	});
});
