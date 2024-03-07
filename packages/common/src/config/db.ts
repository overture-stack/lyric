import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../models/index.js';
import { dbInfo } from './config.js';

export const connect = (info: dbInfo): NodePgDatabase<typeof schema> => {
	const pool = new pg.Pool({
		host: info.host,
		port: info.port,
		database: info.database,
		user: info.user,
		password: info.password,
	});
	console.log(`Connecting to database on ${info.host}`);

	return drizzle(pool, { schema });
};
