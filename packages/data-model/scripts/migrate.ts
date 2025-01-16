import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

const getRequiredNumber = (name: string) => {
	const value = process.env[name];
	const parsedNumber = Number(value);
	if (isNaN(parsedNumber)) {
		throw new Error(`The Environment Variable '${name}' must be a valid number`);
	}
	return parsedNumber;
};

async function main() {
	console.log('Running your migrations...');

	const sql = new pg.Pool({
		host: getRequiredConfig('DB_HOST'),
		database: getRequiredConfig('DB_NAME'),
		password: getRequiredConfig('DB_PASSWORD'),
		port: getRequiredNumber('DB_PORT'),
		user: getRequiredConfig('DB_USER'),
	});
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: 'migrations' });
	await sql.end();
	console.log('Woohoo! Migrations completed!');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
