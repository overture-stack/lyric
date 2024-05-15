import express from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { errorHandler, provider } from 'data-provider';
import { defaultAppConfig, getServerConfig } from './config/server.js';
import swaggerDoc from './config/swagger.js';
import healthRouter from './routes/health.js';
import pingRouter from './routes/ping.js';

const serverConfig = getServerConfig();

const lyricProvider = provider(defaultAppConfig);

// Create Express server
const app = express();

app.use(helmet());

app.use('/ping', pingRouter);
app.use('/dictionary', lyricProvider.routers.dictionary);
app.use('/submission', lyricProvider.routers.submission);
app.use('/data', lyricProvider.routers.submittedData);

// Swagger route
app.use('/api-docs', serve, setup(swaggerDoc));

app.use('/health', healthRouter);

app.use(errorHandler);
// running the server
app.listen(serverConfig.port, () => {
	console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
