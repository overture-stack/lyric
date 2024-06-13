# Lyric

[![NPM Version](https://img.shields.io/npm/v/@overture-stack/lyric?color=%23cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@overture-stack/lyric)

## Install

```
npm i @overture-stack/lyric
```

## Usage

Import `AppConfig` and `provider` from `@overture-stack/lyric` module to initialize the provider with custom configuration:

```
import { AppConfig, provider } from '@overture-stack/lyric';

const ppConfig: AppConfig = {
	db: {
		host: [INSERT_DB_HOST],
		port: [INSERT_DB_PORT],
		database: [INSERT_DB_NAME],
		user:[INSERT_DB_USER],
		password: [INSERT_DB_PASSWORD],
	},
	schemaService: {
		url: [INSERT_LECTERN_URL],
	},
	limits: {
		fileSize: [INSERT_UPLOAD_LIMIT],
	},
	logger: {
		level: [INSERT_LOG_LEVEL],
	},
};


const lyricProvider = provider(defaultAppConfig);
```

Use any of the resources available on provider on a Express server:

- Import a router:

```
import express from 'express';

const app = express();

app.use('/submission', lyricProvider.routers.submission);
```
