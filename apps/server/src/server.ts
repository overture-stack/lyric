import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { serve, setup } from 'swagger-ui-express';

import { errorHandler, provider } from '@overture-stack/lyric';

import { appConfig, getServerConfig } from './config/app.js';
import swaggerDoc from './config/swagger.js';
import healthRouter from './routes/health.js';
import pingRouter from './routes/ping.js';

const { allowedOrigins, port, corsEnabled } = getServerConfig();

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
app.use('/submission', lyricProvider.routers.submission);
app.use('/validator', lyricProvider.routers.validator);

// Swagger route
app.use('/api-docs', serve, setup(swaggerDoc));

app.use('/health', healthRouter);

app.use(errorHandler);
// running the server
app.listen(port, () => {
	console.log(`Starting ExpressJS server on port ${port}`);
});
