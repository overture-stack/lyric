import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrator } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

import type { DbConfig } from '../config/db.js';

export async function migrate(config: DbConfig) {
	console.log('Running your migrations...');

	const sql = new pg.Pool({
		host: config.host,
		database: config.database,
		password: config.password,
		port: config.port,
		user: config.user,
	});
	const db = drizzle(sql);

	const currentDir = fileURLToPath(new URL('.', import.meta.url));

	const migrationsFolder = path.join(currentDir, '..', '..', 'migrations');

	await migrator(db, { migrationsFolder: migrationsFolder });
	await sql.end();
	console.log('Woohoo! Migrations completed!');
}
