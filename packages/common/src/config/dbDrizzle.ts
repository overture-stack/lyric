import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';

const pool = new Pool({
	host: process.env.DB_HOST || '',
	port: Number(process.env.DB_PORT) || 5432,
	database: process.env.DB_DATABASE || '',
	user: process.env.DB_USER || '',
	password: process.env.DB_PASSWORD || '',
});
export const drizzleClient = drizzle(pool);
