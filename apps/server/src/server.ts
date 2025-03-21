import express from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { errorHandler, provider } from '@overture-stack/lyric';

import { defaultAppConfig, getServerConfig } from './config/server.js';
import swaggerDoc from './config/swagger.js';
import healthRouter from './routes/health.js';
import pingRouter from './routes/ping.js';

const serverConfig = getServerConfig();

const lyricProvider = provider(defaultAppConfig);

// Create Express server
const app = express();

app.use(helmet());

// Ping Route
app.use('/ping', pingRouter);

// Lyric Routes
app.use('/audit', lyricProvider.routers.audit);
app.use('/category', lyricProvider.routers.category);
app.use('/data', lyricProvider.routers.submittedData);
app.use('/dictionary', lyricProvider.routers.dictionary);
app.use('/submission', lyricProvider.routers.submission);

// Swagger route
app.get('/api-docs/spec.json', (req, res) => {
	res.json(swaggerDoc);
});
app.use(
	'/api-docs',
	serve,
	setup(undefined, {
		swaggerOptions: { url: '/api-docs/spec.json' },
	}),
);

app.use('/health', healthRouter);

app.use(errorHandler);
// running the server
app.listen(serverConfig.port, () => {
	console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
