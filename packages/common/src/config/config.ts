import { DB } from './db';

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

export const initConfig = async (configData: AppConfig) => {
	const config = await ConfigManager.create(configData);
	return config;
};

export class ConfigManager {
	db!: DB;
	private constructor(private configData: AppConfig) {}
	public static async create(configData: AppConfig) {
		const newConfigManager = new ConfigManager(configData);
		await newConfigManager.loadDb();
		return newConfigManager;
	}
	private async loadDb() {
		const db_ = new DB(this.configData.db);
		await db_.connect();
		this.db = db_;
	}
	getConfig(): AppConfig {
		return this.configData;
	}
	getDbInfo(): dbInfo {
		return this.configData.db;
	}
	getSchemaServiceInfo(): schemaServiceInfo {
		return this.configData.schemaService;
	}
}
