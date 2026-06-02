import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

type LyricProvider = Awaited<ReturnType<typeof createLyricProvider>>;

type RegisterPayload = {
	categoryName: string;
	dictionaryName: string;
	dictionaryVersion: string;
};

// Schema "modified" to trigger a migration: sport.description becomes required.
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
const ORGANIZATION = 'test-org';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Integration - Dictionary Migration Data Validation', () => {
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

	const registerDictionary = async (payload: RegisterPayload) => appDictionary.post('/register').send(payload);

	const waitForMigrationToFinish = async (migrationId: number, maxRetries = 20, delayMs = 300) => {
		let response = await appMigration.get(`/${migrationId}`);
		let attempts = 0;

		while (response.body.status === 'IN_PROGRESS' && attempts < maxRetries) {
			await sleep(delayMs);
			response = await appMigration.get(`/${migrationId}`);
			attempts += 1;
		}

		return response;
	};

	before(async () => {
		schemaServiceUrl = getContainers().providerConfig.schemaService.url;
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		appDictionary = createTestApp(lyricProvider.routers.dictionary);
		appMigration = createTestApp(lyricProvider.routers.migration);
	});

	beforeEach(async () => {
		await seedDictionaryInSchemaService();
		await seedDictionaryInSchemaService(VALID_DICTIONARY_NAME, NEW_DICTIONARY_VERSION, updatedSportSchema);
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('should mark existing submitted data as invalid after migration when new dictionary introduces stricter rules', async () => {
		const initialRegistration = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(initialRegistration.status).to.eql(200);
		const category = await lyricProvider.repositories.category.getCategoryByName(VALID_CATEGORY_NAME);
		expect(category).to.exist;

		const sourceDictionary = await lyricProvider.repositories.dictionary.getDictionary(
			VALID_DICTIONARY_NAME,
			VALID_DICTIONARY_VERSION,
		);
		expect(sourceDictionary).to.exist;

		// save an invalid record (missing the required 'description' field in the new schema)
		await lyricProvider.repositories.submittedData.save({
			data: {
				sport_id: '1',
				name: 'Soccer',
			},
			dictionaryCategoryId: category!.id,
			entityName: 'sport',
			isValid: true,
			lastValidSchemaId: sourceDictionary!.id,
			organization: ORGANIZATION,
			originalSchemaId: sourceDictionary!.id,
			systemId: 'SPORT-1',
			createdBy: 'test',
			updatedBy: 'test',
		});

		const migrationTrigger = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: NEW_DICTIONARY_VERSION,
		});

		expect(migrationTrigger.status).to.eql(200);
		expect(migrationTrigger.body).to.have.property('migrationId');

		const migrationId = migrationTrigger.body.migrationId;
		const migrationDetails = await waitForMigrationToFinish(migrationId);

		expect(migrationDetails.status).to.eql(200);
		expect(migrationDetails.body.status).to.eql('COMPLETED');

		const submittedRecords = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
			category!.id,
			ORGANIZATION,
		);
		expect(submittedRecords).to.have.length(1);
		expect(submittedRecords[0]?.isValid).to.eql(false);
	});

	it('should keep existing submitted data valid after migration when records satisfy the new dictionary rules', async () => {
		const initialRegistration = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: VALID_DICTIONARY_VERSION,
		});

		expect(initialRegistration.status).to.eql(200);
		const category = await lyricProvider.repositories.category.getCategoryByName(VALID_CATEGORY_NAME);
		expect(category).to.exist;

		const sourceDictionary = await lyricProvider.repositories.dictionary.getDictionary(
			VALID_DICTIONARY_NAME,
			VALID_DICTIONARY_VERSION,
		);
		expect(sourceDictionary).to.exist;

		// save a valid record that satisfies the new schema requirements
		await lyricProvider.repositories.submittedData.save({
			data: {
				sport_id: '2',
				name: 'Basketball',
				description: 'Team sport played by two teams',
			},
			dictionaryCategoryId: category!.id,
			entityName: 'sport',
			isValid: true,
			lastValidSchemaId: sourceDictionary!.id,
			organization: ORGANIZATION,
			originalSchemaId: sourceDictionary!.id,
			systemId: 'SPORT-2',
			createdBy: 'test',
			updatedBy: 'test',
		});

		const migrationTrigger = await registerDictionary({
			categoryName: VALID_CATEGORY_NAME,
			dictionaryName: VALID_DICTIONARY_NAME,
			dictionaryVersion: NEW_DICTIONARY_VERSION,
		});

		expect(migrationTrigger.status).to.eql(200);
		expect(migrationTrigger.body).to.have.property('migrationId');

		const migrationId = migrationTrigger.body.migrationId;
		const migrationDetails = await waitForMigrationToFinish(migrationId);

		expect(migrationDetails.status).to.eql(200);
		expect(migrationDetails.body.status).to.eql('COMPLETED');

		const submittedRecords = await lyricProvider.repositories.submittedData.getSubmittedDataByCategoryIdAndOrganization(
			category!.id,
			ORGANIZATION,
		);
		expect(submittedRecords).to.have.length(1);
		expect(submittedRecords[0]?.isValid).to.eql(true);
	});
});
