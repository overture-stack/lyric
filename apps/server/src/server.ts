import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { errorHandler, provider } from 'common';
import { defaultAppConfig, getServerConfig } from './config/server.js';
import swaggerDoc from './config/swagger.js';
import pingRouter from './routes/ping.js';

const serverConfig = getServerConfig();

const lyricProvider = provider(defaultAppConfig);

// Create Express server
const app = express();

app.use(urlencoded({ extended: false }));
app.use(json());

app.use(helmet());

app.use('/ping', pingRouter);
app.use('/dictionary', lyricProvider.routers.dictionary);

// Swagger route
app.use('/api-docs', serve, setup(swaggerDoc));

app.use(errorHandler);
// running the server
app.listen(serverConfig.port, () => {
	console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
