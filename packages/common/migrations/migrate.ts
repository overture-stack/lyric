import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
	const connectionString = process.env.DB_URL;
	if (!connectionString) {
		throw new Error(
			`No Database connection string is provided. To run migrations there must be an environment variable named 'DB_URL' with the database connection URL (example: postgres://user:password@localhost:5432/dbname).`,
		);
	}
	const sql = postgres(connectionString, { max: 1 });
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: 'migrations' });
	await sql.end();
}

main();
