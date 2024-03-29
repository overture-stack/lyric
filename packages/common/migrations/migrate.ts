import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

async function main() {
	console.log('Running your migrations...');
	const connectionString = process.env.DB_URL;
	if (!connectionString) {
		throw new Error(
			`No Database connection string is provided. To run migrations there must be an environment variable named 'DB_URL' with the database connection URL (example: postgres://user:password@localhost:5432/dbname).`,
		);
	}
	const sql = new pg.Pool({ connectionString });
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: 'migrations' });
	await sql.end();
	console.log('Woohoo! Migrations completed!');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
