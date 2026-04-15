import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { GenericContainer, Network, Wait } from 'testcontainers';

import type { DbConfig } from '@overture-stack/lyric-data-model';

import type { SchemaServiceConfig } from '../../../src/config/config.js';
import type { LyricProviderConfig } from './lyricProvider.js';

export type StartedContainers = {
	providerConfig: Pick<LyricProviderConfig, 'db' | 'schemaService'>;
	resetDatabases: () => Promise<void>;
	stop: () => Promise<void>;
};

export async function startContainers(): Promise<StartedContainers> {
	const network = await new Network().start();

	const postgresContainer = await new PostgreSqlContainer('postgres:15-alpine').start();

	const mongoContainer = await new GenericContainer('bitnami/mongodb:latest')
		.withNetwork(network)
		.withNetworkAliases('mongo')
		.withEnvironment({
			MONGODB_USERNAME: 'admin',
			MONGODB_PASSWORD: 'password',
			MONGODB_DATABASE: 'lectern',
			MONGODB_ROOT_PASSWORD: 'password123',
		})
		.withExposedPorts(27017)
		.withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
		.start();

	const lecternContainer = await new GenericContainer('ghcr.io/overture-stack/lectern:latest')
		.withNetwork(network)
		.withEnvironment({
			MONGO_HOST: 'mongo',
			MONGO_PORT: '27017',
			MONGO_DB: 'lectern',
			MONGO_USER: 'admin',
			MONGO_PASS: 'password',
		})
		.withExposedPorts(3000)
		.withWaitStrategy(Wait.forHttp('/health', 3000))
		.start();

	const schemaServiceUrl = `http://${lecternContainer.getHost()}:${lecternContainer.getMappedPort(3000)}`;

	const dbConfig: DbConfig = {
		host: postgresContainer.getHost(),
		port: postgresContainer.getPort(),
		database: postgresContainer.getDatabase(),
		user: postgresContainer.getUsername(),
		password: postgresContainer.getPassword(),
	};

	const schemaServiceConfig: SchemaServiceConfig = { url: schemaServiceUrl };

	const resetDatabases = async () => {
		const pool = new pg.Pool(dbConfig);
		await pool.query(`
				DO $$ DECLARE r RECORD;
				BEGIN
					FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%') LOOP
						EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
					END LOOP;
				END $$;
			`);
		await pool.end();

		await mongoContainer.exec([
			'mongosh',
			'--username',
			'root',
			'--password',
			'password123',
			'--authenticationDatabase',
			'admin',
			'lectern',
			'--eval',
			'db.getCollectionNames().forEach(function(name) { db[name].deleteMany({}) })',
		]);
	};

	const stopContainers = async () => {
		await lecternContainer.stop();
		await mongoContainer.stop();
		await postgresContainer.stop();
		await network.stop();
	};

	return {
		providerConfig: {
			db: dbConfig,
			schemaService: schemaServiceConfig,
		},
		resetDatabases,
		stop: stopContainers,
	};
}
