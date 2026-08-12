import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import { dictionarySportsData, updatedSportSchema } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';
import {
	NEW_DICTIONARY_VERSION,
	type RegisterPayload,
	VALID_CATEGORY_NAME,
	VALID_DICTIONARY_NAME,
	VALID_DICTIONARY_VERSION,
} from './fixtures.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

	// The migration itself runs in a background worker (fired without being awaited by
	// `registerDictionary`), so a test that mutates a migration's status directly must first wait
	// for that worker to reach a terminal status — otherwise the manual override races with the
	// worker's own status transition.
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

	it('should retry migration when force registering the same dictionary version after a failed migration', async () => {
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

		// Wait for the background migration worker to finish before overriding its status below,
		// otherwise the worker's own status write can race with this test's manual override.
		await waitForMigrationToFinish(migrationId);

		// Making the migration fail by force registering the same new version again
		await lyricProvider.repositories.migration.update(migrationId, {
			status: 'FAILED',
		});

		const forcingMigrationResponse = await registerDictionary(
			{
				categoryName: VALID_CATEGORY_NAME,
				dictionaryName: VALID_DICTIONARY_NAME,
				dictionaryVersion: NEW_DICTIONARY_VERSION,
			},
			true,
		);

		expect(forcingMigrationResponse.status).to.eql(200);
		expect(forcingMigrationResponse.body).to.have.property('categoryId');
		expect(forcingMigrationResponse.body.categoryName).to.eql(VALID_CATEGORY_NAME);
		expect(forcingMigrationResponse.body.name).to.eql(VALID_DICTIONARY_NAME);
		expect(forcingMigrationResponse.body.version).to.eql(NEW_DICTIONARY_VERSION);
		expect(forcingMigrationResponse.body).to.have.property('migrationId');
	});
});
