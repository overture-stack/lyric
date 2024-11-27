import 'dotenv/config';

import type { DbConfig } from '../src/config/db.js';
import { migrate } from '../src/functions/migrate.js';

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

const config: DbConfig = {
	host: getRequiredConfig('DB_HOST'),
	database: getRequiredConfig('DB_NAME'),
	password: getRequiredConfig('DB_PASSWORD'),
	port: Number(getRequiredConfig('DB_PORT')),
	user: getRequiredConfig('DB_USER'),
};

// Run if executed as a CLI
migrate(config).catch((err) => {
	console.error(err);
	process.exit(1);
});
