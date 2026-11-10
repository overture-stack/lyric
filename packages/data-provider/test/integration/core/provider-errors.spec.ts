import { expect } from 'chai';
import express from 'express';
import { after, before, describe, it } from 'mocha';
import supertest from 'supertest';

import { errorHandler, LYRIC_ERROR_TYPES } from '../../../index.js';
import { createLyricProvider, type LyricProvider } from '../dependencies/lyricProvider.js';
import { getContainers } from '../globalSetup.js';

describe('Integration - Provider - error types', () => {
	let lyricProvider: LyricProvider;

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('provides every Lyric error type the package exports', () => {
		const providedErrorTypes = Object.values(lyricProvider.utils.errors);

		for (const errorType of LYRIC_ERROR_TYPES) {
			expect(providedErrorTypes).to.include(errorType);
		}
	});

	it("answers a provided error type with that error's status through the exported errorHandler", async () => {
		const app = express();
		app.post('/', () => {
			throw new lyricProvider.utils.errors.StatusConflict('Submission is missing files');
		});
		app.use(errorHandler);

		const response = await supertest(app).post('/');

		expect(response.status).to.equal(409);
		expect(response.body).to.include({ error: 'Conflict', message: 'Submission is missing files' });
	});
});
