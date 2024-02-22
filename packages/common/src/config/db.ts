import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';
import { dbInfo } from './config';

export class DB {
	public info: dbInfo;
	private connected = false;
	public pg!: Pool;
	public drizzle!: PostgresJsDatabase;

	constructor(info: dbInfo) {
		this.info = info;
	}
	async connect() {
		if (this.connected) {
			return;
		}

		const pool = new Pool({
			host: this.info.host,
			port: this.info.port,
			database: this.info.database,
			user: this.info.user,
			password: this.info.password,
		});
		const drizzleClient = drizzle(pool);

		this.connected = true;

		this.pg = pool;
		this.drizzle = drizzleClient;
	}
}
