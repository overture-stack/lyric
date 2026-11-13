import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { AppConfig, WorkerPoolSettings } from '../../../src/config/config.js';
import { DEFAULT_MAX_WORKERS, resolveMaxWorkers } from '../../../src/workers/workerPoolManager.js';

const appConfigWith = (workerPool?: WorkerPoolSettings): AppConfig =>
	({
		auth: { enabled: false },
		db: { host: 'localhost', port: 5432, database: 'lyric', user: 'lyric', password: 'test' },
		idService: { useLocal: true, customAlphabet: 'ABC', customSize: 3 },
		logger: { level: 'silent' },
		schemaService: { url: 'http://localhost' },
		submissionService: {},
		validator: [],
		workerPool,
	}) satisfies AppConfig;

describe('Worker pool manager - maximum number of workers', () => {
	it('defaults to one worker when nothing sets it', () => {
		expect(DEFAULT_MAX_WORKERS).to.equal(1);
		expect(resolveMaxWorkers(appConfigWith(), undefined)).to.equal(1);
	});

	it('does not depend on the machine CPU count when nothing sets it', () => {
		expect(resolveMaxWorkers(appConfigWith({}), {})).to.equal(DEFAULT_MAX_WORKERS);
	});

	it('uses the value set in the application configuration', () => {
		expect(resolveMaxWorkers(appConfigWith({ maxWorkers: 4 }), undefined)).to.equal(4);
	});

	it('prefers the application configuration over the resolver pool options', () => {
		expect(resolveMaxWorkers(appConfigWith({ maxWorkers: 4 }), { maxWorkers: 2 })).to.equal(4);
	});

	it('uses the resolver pool options when the application configuration does not set it', () => {
		expect(resolveMaxWorkers(appConfigWith(), { maxWorkers: 2 })).to.equal(2);
	});

	for (const maxWorkers of [0, -1, 1.5, Number.NaN]) {
		it(`refuses ${maxWorkers} as the maximum`, () => {
			expect(() => resolveMaxWorkers(appConfigWith({ maxWorkers }), undefined)).to.throw(
				"Worker pool 'maxWorkers' must be an integer of at least 1",
			);
		});
	}
});
