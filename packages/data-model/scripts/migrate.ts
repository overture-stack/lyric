import { migrate } from '../src/functions/migrate.js';

// Run if executed as a CLI
migrate().catch((err) => {
	console.error(err);
	process.exit(1);
});
