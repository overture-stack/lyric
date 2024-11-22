import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrator } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

export async function migrate() {
	console.log('Running your migrations...');

	const sql = new pg.Pool({
		host: getRequiredConfig('DB_HOST'),
		database: getRequiredConfig('DB_NAME'),
		password: getRequiredConfig('DB_PASSWORD'),
		port: Number(getRequiredConfig('DB_PORT')),
		user: getRequiredConfig('DB_USER'),
	});
	const db = drizzle(sql);

	const currentDir = fileURLToPath(new URL('.', import.meta.url));

	const migrationsFolder = path.join(currentDir, '..', '..', 'migrations');

	await migrator(db, { migrationsFolder: migrationsFolder });
	await sql.end();
	console.log('Woohoo! Migrations completed!');
}
