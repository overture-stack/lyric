import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { dbInfo } from './config.js';

export class DB {
	public info: dbInfo;
	public connected = false;
	public pg!: pg.Pool;
	public drizzle!: NodePgDatabase;

	constructor(info: dbInfo) {
		this.info = info;
	}
	async connect() {
		if (this.connected) {
			return;
		}

		const pool = new pg.Pool({
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
