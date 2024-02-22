import { DB } from './db';

const db_ = new DB({
	host: process.env.DB_HOST || '',
	port: Number(process.env.DB_PORT) || 5432,
	database: process.env.DB_DATABASE || '',
	user: process.env.DB_USER || '',
	password: process.env.DB_PASSWORD || '',
});
async () => {
	await db_.connect();
};
export const db = db_;
