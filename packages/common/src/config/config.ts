import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from 'winston';

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
	db: NodePgDatabase;
	config: AppConfig;
	logger: Logger;
}
