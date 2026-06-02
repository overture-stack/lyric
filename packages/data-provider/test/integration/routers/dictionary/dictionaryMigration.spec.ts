import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

type RegisterPayload = {
	categoryName?: string;
	dictionaryName?: string;
	dictionaryVersion?: string;
	defaultCentricEntity?: string;
};

// Schema "modified" to trigger a migration.
const updatedSportSchema = dictionarySportsData.map((schema) => {
	if (schema.name === 'sport') {
		return {
			...schema,
			fields: schema.fields.map((field) => {
				if (field.name === 'description') {
					return {
						...field,
						restrictions: {
							required: true,
						},
					};
				}
				return field;
			}),
		};
	}
	return schema;
});

const VALID_CATEGORY_NAME = 'test-category';
const VALID_DICTIONARY_NAME = 'valid-dictionary';
const VALID_DICTIONARY_VERSION = '1.0';
const NEW_DICTIONARY_VERSION = '2.0';

describe('Integration - Dictionary Migration', () => {
	let appDictionary: supertest.Agent;
	let appMigration: supertest.Agent;
	let lyricProvider: LyricProvider;
	let schemaServiceUrl: string;

	const seedDictionaryInSchemaService = async (
		name = VALID_DICTIONARY_NAME,
		version = VALID_DICTIONARY_VERSION,
		schemas = dictionarySportsData,
	) => {
		const schemaServiceResponse = await fetch(`${schemaServiceUrl}/dictionaries`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				version,
				schemas,
			}),
		});

		expect(schemaServiceResponse.status, `Failed to seed dictionary '${name}' '${version}' in schema service`).to.eql(
			200,
		);
	};

	const registerDictionary = async (payload: RegisterPayload, force = false) =>
		appDictionary.post(`/register${force ? '?force=true' : ''}`).send(payload);

	before(async () => {
		schemaServiceUrl = getContainers().providerConfig.schemaService.url;
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		appDictionary = createTestApp(lyricProvider.routers.dictionary);
		appMigration = createTestApp(lyricProvider.routers.migration);
	});

	beforeEach(async () => {
		// processInsertRecordsAsyncStub.resetHistory();
		await seedDictionaryInSchemaService();
		await seedDictionaryInSchemaService(VALID_DICTIONARY_NAME, NEW_DICTIONARY_VERSION, updatedSportSchema);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		// submissionProcessorFactory.create = originalCreate;
		await lyricProvider.shutdown();
	});

	it('should return "200 OK" with a "migrationId" in the response when registering a new version of the dictionary in the category', async () => {
		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(response.status).to.eql(200);
		expect(response.body).to.have.property('categoryId');
		expect(response.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(response.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(response.body.version).to.eql(VALID_DICTIONARY_VERSION);

		// registering a new version of a dictionary with the same category
		const migrationResponse = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: NEW_DICTIONARY_VERSION,
		});

		expect(migrationResponse.status).to.eql(200);
		expect(migrationResponse.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(migrationResponse.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(migrationResponse.body.version).to.eql(NEW_DICTIONARY_VERSION);
		expect(migrationResponse.body).to.have.property('migrationId');
	});

	it('should return migration details when registering a new version of a dictionary', async () => {
		const response = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(response.status).to.eql(200);
		expect(response.body).to.have.property('categoryId');
		expect(response.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(response.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(response.body.version).to.eql(VALID_DICTIONARY_VERSION);

		// registering a new version of a dictionary with the same category
		const migrationResponse = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: NEW_DICTIONARY_VERSION,
		});

		expect(migrationResponse.status).to.eql(200);
		expect(migrationResponse.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(migrationResponse.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(migrationResponse.body.version).to.eql(NEW_DICTIONARY_VERSION);
		expect(migrationResponse.body).to.have.property('migrationId');

		const migrationId = migrationResponse.body.migrationId;

		const migrationDetails = await appMigration.get(`/${migrationId}`);

		expect(migrationDetails.status).to.eql(200);
		expect(migrationDetails.body.id).to.eql(migrationId);
		expect(migrationDetails.body.fromDictionary).to.eql({
			name: VALID_DICTIONARY_NAME,
			version: VALID_DICTIONARY_VERSION,
		});
		expect(migrationDetails.body.toDictionary).to.eql({
			name: VALID_DICTIONARY_NAME,
			version: NEW_DICTIONARY_VERSION,
		});
	});

	it('should return migration details when force registering the same dictionary version again', async () => {
		const initialResponse = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(initialResponse.status).to.eql(200);
		expect(initialResponse.body).to.have.property('categoryId');
		expect(initialResponse.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(initialResponse.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(initialResponse.body.version).to.eql(VALID_DICTIONARY_VERSION);

		const response = await registerDictionary(
			{
				categoryName: VALID_CATEGORY_NAME,
				dictionaryName: VALID_DICTIONARY_NAME,
				dictionaryVersion: VALID_DICTIONARY_VERSION,
			},
			true,
		);

		expect(response.status).to.eql(200);
		expect(response.body).to.have.property('categoryId');
		expect(response.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(response.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(response.body.version).to.eql(VALID_DICTIONARY_VERSION);
		expect(response.body).to.have.property('migrationId');

		const migrationId = response.body.migrationId;
		const migrationDetails = await appMigration.get(`/${migrationId}`);

		expect(migrationDetails.status).to.eql(200);
		expect(migrationDetails.body.id).to.eql(migrationId);
		expect(migrationDetails.body.fromDictionary).to.eql({
			name: VALID_DICTIONARY_NAME,
			version: VALID_DICTIONARY_VERSION,
		});
		expect(migrationDetails.body.toDictionary).to.eql({
			name: VALID_DICTIONARY_NAME,
			version: VALID_DICTIONARY_VERSION,
		});
	});
});
