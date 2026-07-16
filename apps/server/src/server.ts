import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { errorHandler, getLogger, provider } from '@overture-stack/lyric';

import { buildAppConfig, getServerConfig } from './config/app.js';
import { getKafkaConfig, setupKafka } from './config/kafka.js';
import swaggerDoc from './config/swagger.js';
import healthRouter from './routes/health.js';
import pingRouter from './routes/ping.js';

const { allowedOrigins, port, corsEnabled } = getServerConfig();

const logger = getLogger({ level: process.env.LOG_LEVEL || 'info' });
const kafkaConfig = getKafkaConfig(logger);
const kafka = kafkaConfig ? await setupKafka(logger, kafkaConfig) : undefined;

const appConfig = buildAppConfig({ onFinishCommit: kafka?.onFinishCommit });

const lyricProvider = provider(appConfig);

// Create Express server
const app = express();

app.use(helmet());

app.use(
	cors({
		origin: function (origin, callback) {
			// If CORS is disabled, allow the request regardless of the origin
			if (!corsEnabled) {
				return callback(null, true);
			}

			// If the origin is in the allowed origins list, allow the request
			if (origin && allowedOrigins.indexOf(origin) !== -1) {
				return callback(null, true);
			}
			const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
			return callback(new Error(msg), false);
		},
	}),
);

// Ping Route
app.use('/ping', pingRouter);

// Lyric Routes
app.use('/audit', lyricProvider.routers.audit);
app.use('/category', lyricProvider.routers.category);
app.use('/data', lyricProvider.routers.submittedData);
app.use('/dictionary', lyricProvider.routers.dictionary);
app.use('/migration', lyricProvider.routers.migration);
app.use('/submission', lyricProvider.routers.submission);
app.use('/validator', lyricProvider.routers.validator);

// Swagger route
app.get('/api-docs/openapi.json', (req, res) => res.json(swaggerDoc));

app.use('/api-docs', serve, setup(swaggerDoc, { swaggerUrl: '/openapi.json' }));

app.use('/health', healthRouter);

app.use(errorHandler);

const server = app.listen(port, () => {
	logger.info(`ExpressJS server is running on port ${port}`);
});

const gracefulShutdown = async (signal: string) => {
	logger.info(`Received ${signal}, shutting down…`);

	// 1. Stop accepting new requests
	server.close();

	// 2. Disconnect Kafka producer before draining workers (no new publishes after this)
	await kafka?.disconnect();

	// 3. Drain and terminate worker threads
	await lyricProvider.shutdown();

	process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
