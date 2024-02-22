import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { dictionaryRouter, initConfig } from 'common';
import { defaultAppConfig, getServerConfig } from './config/server';
import swaggerDoc from './config/swagger';
import pingRouter from './routes/ping';

const serverConfig = getServerConfig();

async () => {
	await initConfig(defaultAppConfig);
};

// Create Express server
const app = express();

app.use(urlencoded({ extended: false }));
app.use(json());

app.use(helmet());

app.use('/ping', pingRouter);
app.use('/dictionary', dictionaryRouter);

// Swagger route
app.use('/api-docs', serve, setup(swaggerDoc));

// running the server
app.listen(serverConfig.port, () => {
	console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
