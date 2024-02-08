import express, { json, urlencoded } from 'express';
import helmet from 'helmet';

import pingRouter from './routers/ping';
import dictionaryRouter from './routers/dictionary';
import { getServerConfig } from './config';

const serverConfig = getServerConfig();

// Create Express server
const app = express();

app.use(helmet());

app.use('/ping', pingRouter);
app.use('/dictionary', dictionaryRouter);

app.use(urlencoded({ extended: false, limit: serverConfig.upload_limit }));
app.use(json({ limit: serverConfig.upload_limit }));

// running the server
app.listen(serverConfig.port, () => {
  console.log(`Starting Express server on http://localhost:${serverConfig.port}`);
});
