import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from '@overture-stack/lyric-data-model';

import { DbConfig } from './config.js';

export const connect = (config: DbConfig): NodePgDatabase<typeof schema> => {
	const pool = new pg.Pool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.user,
		password: config.password,
	});
	console.log(`Connecting to database on ${config.host}`);

	return drizzle(pool, { schema });
};
