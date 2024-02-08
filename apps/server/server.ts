import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { getServerConfig } from './config/server';
import swaggerDoc from './config/swagger';
import dictionaryRouter from './routes/dictionary';
import pingRouter from './routes/ping';

const serverConfig = getServerConfig();

// Create Express server
const app = express();

app.use(helmet());

app.use('/ping', pingRouter);
app.use('/dictionary', dictionaryRouter);

// Swagger route
app.use('/api-docs', serve, setup(swaggerDoc));

app.use(urlencoded({ extended: false, limit: serverConfig.upload_limit }));
app.use(json({ limit: serverConfig.upload_limit }));

// running the server
app.listen(serverConfig.port, () => {
	console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
