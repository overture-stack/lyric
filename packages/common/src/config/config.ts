import { DB } from './db.js';

export type dbInfo = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
};

export type schemaServiceInfo = {
	url: string;
};

export type AppConfig = {
	db: dbInfo;
	schemaService: schemaServiceInfo;
};

export interface Dependencies {
	db: DB;
	config: AppConfig;
}

export class GlobalConfig {
	dependencies: Dependencies;
	constructor(dependencies: Dependencies) {
		this.dependencies = dependencies;
	}
}

export class ConfigManager {
	dependencies: Dependencies;
	constructor(configData: AppConfig) {
		this.dependencies = {
			config: configData,
		} as Dependencies;
	}
	async loadDb() {
		const db_ = new DB(this.dependencies.config.db);
		await db_.connect();
		this.dependencies.db = db_;
	}
}
