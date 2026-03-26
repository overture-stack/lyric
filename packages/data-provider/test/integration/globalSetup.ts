/**
 * Global integration test setup.
 *
 * This file is loaded via `--file` in the `test:integration` script, which causes Mocha to execute
 * it before any spec files. The root-level `before` and `after` hooks defined here run once for the
 * entire integration test suite — not once per file or once per test.
 *
 * All integration test files share the same container instances through `getContainers()`. Each file
 * is still responsible for creating and disconnecting its own `LyricProvider`, and for calling
 * `getContainers().resetDatabases()` in `afterEach` to keep tests isolated from one another.
 *
 * By starting the containers here we only need to wait for containers to start once, instead of at
 * the start of every test file.
 */
import { startContainers, type StartedContainers } from './dependencies/containers.js';

let sharedContainers: StartedContainers;

export function getContainers(): StartedContainers {
	return sharedContainers;
}

before(async function () {
	this.timeout(120000);
	sharedContainers = await startContainers();
});

after(async function () {
	await sharedContainers?.stop();
});
