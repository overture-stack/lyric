import { Logger } from 'winston';
import { DB } from './db.js';
import { getLogger } from './logger.js';

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

export type LoggerConfig = {
	level?: string;
	file?: boolean;
};

export type AppConfig = {
	db: dbInfo;
	schemaService: schemaServiceInfo;
	logger: LoggerConfig;
};

export interface Dependencies {
	db: DB;
	config: AppConfig;
	logger: Logger;
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
	async loadLogger() {
		const logger_ = getLogger(this.dependencies.config.logger);
		this.dependencies.logger = logger_;
	}
}
