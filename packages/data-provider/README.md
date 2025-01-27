# Lyric

[![NPM Version](https://img.shields.io/npm/v/@overture-stack/lyric?color=%23cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@overture-stack/lyric)

## Install

```
npm i @overture-stack/lyric
```

## Configuration

### Provider

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

### On Finish Commit Callback function

The `onFinishCommit` callback function is executed automatically when a commit event is completed. This function provides the ability to customize the behavior or perform any additional actions after the commit is finished, using the result of the commit operation.

Example:

```javascript
const onFinishCommitCallback: (resultOnCommit: ResultOnCommit) => {
    // Check if there are inserts, updates, or deletes
    if (resultOnCommit.data) {
      const { inserts, updates, deletes } = resultOnCommit.data;

      // Log the results to the console
      console.log(`Inserts: ${inserts.length}`);
      console.log(`Updates: ${updates.length}`);
      console.log(`Deletes: ${deletes.length}`);
    }

    // You can also perform additional custom actions here
    // For example index the data, or make another API call
  }
```

To use the `onFinishCommit` callback, it requires to be defined in the AppConfig object:

```javascript

const appConfig: AppConfig = {
	...// Other configuration
	onFinishCommit: onFinishCommitCallback;
}
```

## Usage

### Express Routers

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
