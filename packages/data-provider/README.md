# Lyric

[![NPM Version](https://img.shields.io/npm/v/@overture-stack/lyric?color=%23cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@overture-stack/lyric)

## Install

```
npm i @overture-stack/lyric
```

## Configuration

### Provider

Import `AppConfig` and `provider` from `@overture-stack/lyric` module to initialize the provider with custom configuration:

```javascript
import { AppConfig, provider } from '@overture-stack/lyric';

const appConfig: AppConfig = {
	db: {
		host: 'localhost', // Database hostname or IP address
		port: 5432, // Database port
		database: 'my_database', // Name of the database
		user: 'db_user', // Username for database authentication
		password: 'secure_password', // Password for database authentication
	},
	features: {
		audit: {
			enabled: true, // Enable audit functionality (true/false)
		},
		recordHierarchy: {
			pluralizeSchemasName: false, // Enable or disable automatic schema name pluralization (true/false)
		},
	},
	idService: {
		useLocal: true, // Use local ID generation (true/false)
		customAlphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', // Custom alphabet for ID generation
		customSize: 12, // Size of the generated ID
	},
	limits: {
		fileSize: 10485760, // Maximum file size in bytes (e.g., 10MB = 10 * 1024 * 1024)
	},
	logger: {
		level: 'info', // Logging level (e.g., 'debug', 'info', 'warn', 'error')
	},
	schemaService: {
		url: 'https://api.lectern-service.com', // URL of the schema service
	},
};


const lyricProvider = provider(appConfig);
```

### Auth Custom Hanlder

The **authentication custom handler** is a customized function that can be used to verify and manage user authentication within the application. It is used by the auth middleware to process incoming requests.

The handler returns a `UserSessionResult` response type, which is a structured object that indicates the authentication status (`authenticated`, `no-auth`, or `invalid-auth`), if the status is `authenticated` it also include user details provided by the `UserSession` type.

Example how to implement a custom auth handler:

```javascript
import { Request } from 'express';
import { UserSessionResult } from '@overture-stack/lyric';
import jwt from 'jsonwebtoken';

const authHandler = (req: Request): UserSessionResult => {
    // Extract the token from the request header
    const authHeader = req.headers['authorization'];

    // Check if the Authorization header exists and starts with "Bearer"
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return {
			authStatus: 'no-auth'
		}
	}

	// Extract the token by removing the "Bearer " prefix
	const token = authHeader.split(' ')[1];

    try {
		// Verify the token using a public key
		const publicKey = process.env.JWT_PUBLIC_KEY!;
		const decodedToken = jwt.verify(token, publicKey);

		return {
			user: { username:  decodedToken.username }, // Example: Adjust fields as per your `UserSession` type
			authStatus: 'authenticated',
		};
	} catch (err) {
		return {
			authStatus: 'invalid-auth';
		}
	}
};
```

Add the handler to your `AppConfig` object.

```javascript
import { AppConfig, provider, UserSession } from '@overture-stack/lyric';

const appConfig: AppConfig = {
	...// Other configuration
	auth: {
		enabled: true,
		customAuthHandler: authHandler,
	};
}
```

## Usage

### Express Routers

Use any of the resources available on provider on a Express server:

```javascript
import express from 'express';

const app = express();

app.use('/submission', lyricProvider.routers.submission);
```

### Database Migrations

Import `migrate` function from `@overture-stack/lyric` module to run Database migrations

```javascript
import { migrate } from '@overture-stack/lyric';

migrate({
	host: 'localhost', // Database hostname or IP address
	port: 5432, // Database port
	database: 'my_database', // Name of the database
	user: 'db_user', // Username for database authentication
	password: 'secure_password', // Password for database authentication
});
```

## Support & Contributions

- Developer documentation [docs](https://github.com/overture-stack/lyric/blob/main/packages/data-provider/docs/add-new-resources.md)
- Filing an [issue](https://github.com/overture-stack/lyric/issues)
- Connect with us on [Slack](http://slack.overture.bio)
- Add or Upvote a [feature request](https://github.com/overture-stack/lyric/issues/new?assignees=&labels=&projects=&template=Feature_Requests.md)

```

```
