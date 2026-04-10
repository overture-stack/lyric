import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { DbConfig, models } from '@overture-stack/lyric-data-model';

const poolRegistry = new WeakMap<NodePgDatabase<typeof models>, pg.Pool>();

export const getConnectionPool = (db: NodePgDatabase<typeof models>): pg.Pool | undefined => poolRegistry.get(db);

export const connect = (config: DbConfig): NodePgDatabase<typeof models> => {
	const pool = new pg.Pool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.user,
		password: config.password,
	});
	console.log(`Connecting to database on ${config.host}`);

	const db = drizzle(pool, { schema: models });
	poolRegistry.set(db, pool);
	return db;
};
