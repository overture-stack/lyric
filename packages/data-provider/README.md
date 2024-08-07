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

const appConfig: AppConfig = {
	db: {
		host: [INSERT_DB_HOST],
		port: [INSERT_DB_PORT],
		database: [INSERT_DB_NAME],
		user:[INSERT_DB_USER],
		password: [INSERT_DB_PASSWORD],
	},
	features: {
		audit: {
			enabled: [INSERT_AUDIT_ENABLED]
		}
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


const lyricProvider = provider(appConfig);
```

Use any of the resources available on provider on a Express server:

- Import a router:

```
import express from 'express';

const app = express();

app.use('/submission', lyricProvider.routers.submission);
```

## Support & Contributions

- Developer documentation [docs](https://github.com/overture-stack/lyric/blob/main/packages/data-provider/docs/add-new-resources.md)
- Filing an [issue](https://github.com/overture-stack/lyric/issues)
- Connect with us on [Slack](http://slack.overture.bio)
- Add or Upvote a [feature request](https://github.com/overture-stack/lyric/issues/new?assignees=&labels=&projects=&template=Feature_Requests.md)
