import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
	const connectionString = process.env.DB_URL || 'postgres://postgres:secret@localhost:5432/lyric';
	const sql = postgres(connectionString, { max: 1 });
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: 'migrations' });
	await sql.end();
}

main();
