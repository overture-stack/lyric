import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { DbConfig, models } from '@overture-stack/lyric-data-model';

export const connect = (config: DbConfig) => {
	const pool = new pg.Pool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.user,
		password: config.password,
	});
	console.log(`Connecting to database on ${config.host}`);

	const db = drizzle(pool, { schema: models });

	return {
		pool: db,
		config,
	};
};
