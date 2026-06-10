import { expect } from 'chai';
import { after, afterEach, before, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import {
	type RegisterPayload,
	VALID_CATEGORY_NAME,
	VALID_DICTIONARY_NAME,
	VALID_DICTIONARY_VERSION,
} from './fixtures.js';

describe('Integration - Dictionary Router - POST /register', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let schemaServiceUrl: string;

	const seedDictionaryInSchemaService = async (name = VALID_DICTIONARY_NAME, version = VALID_DICTIONARY_VERSION) => {
		const schemaServiceResponse = await fetch(`${schemaServiceUrl}/dictionaries`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				version,
				schemas: dictionarySportsData,
			}),
		});

		expect(schemaServiceResponse.status, `Failed to seed dictionary '${name}' '${version}' in schema service`).to.eql(
			200,
		);
	};

	const registerDictionary = async (payload: RegisterPayload) => app.post('/register').send(payload);

	before(async () => {
		schemaServiceUrl = getContainers().providerConfig.schemaService.url;
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.dictionary);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('should return 400 when required fields are missing', async () => {
		const response = await registerDictionary({
			// Missing categoryName, dictionaryName and dictionaryVersion.
		});

		expect(response.status).to.equal(400);
		expect(response.body).to.have.property('error');
		expect(response.body).to.have.property(
			'message',
			'categoryName is Required | dictionaryName is Required | dictionaryVersion is Required',
		);
	});

	it('should return 503 when dictionary is invalid', async () => {
		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: 'invalid-dictionary',
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(response.status).to.equal(503);
		expect(response.body).to.have.property('error', 'Service unavailable');
		expect(response.body).to.have.property('message');
	});

	it('should return 200 and register the dictionary when valid data is provided', async () => {
		await seedDictionaryInSchemaService();

		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('categoryId');
		expect(response.body).to.have.property('categoryName', VALID_CATEGORY_NAME);
		expect(response.body).to.have.property('name', VALID_DICTIONARY_NAME);
		expect(response.body).to.have.property('version', VALID_DICTIONARY_VERSION);
	});

	it('should return 400 Bad Request when default schema is invalid', async () => {
		await seedDictionaryInSchemaService();

		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
			defaultCentricEntity: 'invalid-entity',
		});

		expect(response.status).to.equal(400);
		expect(response.body).to.have.property('error', 'Bad Request');
		expect(response.body).to.have.property('message', "Entity 'invalid-entity' does not exist in this dictionary");
	});

	it('should return 409 Conflict when trying to register a dictionary that already exists', async () => {
		await seedDictionaryInSchemaService();

		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(response.status).to.equal(200);
		expect(response.body).to.have.property('categoryId');
		expect(response.body).to.have.property('categoryName', VALID_CATEGORY_NAME);
		expect(response.body).to.have.property('name', VALID_DICTIONARY_NAME);
		expect(response.body).to.have.property('version', VALID_DICTIONARY_VERSION);

		// registering the same dictionary again should result in a 409 Conflict
		const duplicateRegisterResponse = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(duplicateRegisterResponse.status).to.equal(409);
		expect(duplicateRegisterResponse.body).to.have.property('error', 'Conflict');
		expect(duplicateRegisterResponse.body).to.have.property(
			'message',
			`Category '${VALID_CATEGORY_NAME}' with Dictionary '${VALID_DICTIONARY_NAME}' version '${VALID_DICTIONARY_VERSION}' already exists`,
		);
	});
});
