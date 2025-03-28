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
	auth: {
		enabled: false,
	}
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
	logger: {
		level: 'info', // Logging level (e.g., 'debug', 'info', 'warn', 'error')
	},
	schemaService: {
		url: 'https://api.lectern-service.com', // URL of the schema service
	},
};


const lyricProvider = provider(appConfig);
```

### Auth Custom Handler

The **authentication custom handler** is a customizable function that can be used to verify user authentication and grant write permissions to organizations. It is used by the auth middleware to process incoming requests before any operation is executed.

The handler receives an argument of type `Request` and returns a `UserSessionResult` response type, which provides information about the user's session or any errors encountered during the process.

This result `UserSessionResult` object may include the following:

- **user**: A `UserSession` object containing details of the authenticated user:

  ```javascript
  	{
  		username: string;
  		isAdmin: boolean;
  		allowedWriteOrganizations: string[];
  	}
  ```

  - **username**: A string representing the user's identifier (e.g., email address).
  - **isAdmin**: A boolean value indicating whether the user has admin privileges. If `true`, the user has write access to all organizations.
  - **allowedWriteOrganization**: An array of strings representing the organizations to which the user is allowed to write data.

  When the handler function returns this `user` object, the user has read access to all endpoints within the application. Otherwise, it should return the following error details:

- **errorCode**: A numeric code representing an error that occurred while processing the session request.
- **errorMessage**: A descriptive message detailing the specific error, if an errorCode is provided.

Example how to implement a custom auth handler:

```javascript
import { type Request } from 'express';
import { type UserSessionResult } from '@overture-stack/lyric';
import jwt from 'jsonwebtoken';

const authHandler = (req: Request): UserSessionResult => {
    // Extract the token from the request header
    const authHeader = req.headers['authorization'];

    // Check if the Authorization header exists and starts with "Bearer"
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return {
			errorCode: 401,
			errorMessage: 'Unauthorized: No token provided'
		}
	}

	// Extract the token by removing the "Bearer " prefix
	const token = authHeader.split(' ')[1];

    try {
		// Verify the token using a public key
		const publicKey = process.env.JWT_PUBLIC_KEY!;
		const decodedToken = jwt.verify(token, publicKey);

		// Return the user session information after successfully verifying the  token
		return {
			user: {
				username: decodedToken.username, // Extract username from the decoded token
				isAdmin: decodedToken.isAdmin, // Check if the user has admin privileges
				allowedWriteOrganizations: decodedToken.scopes, // Get the list of organizations the user can write to
			 },
		};
	} catch (err) {
		 // If the token is invalid or an error occurs, return a forbidden error
		return {
			errorCode: 403,
			errorMessage: 'Forbidden: Invalid token'
		}
	}
};
```

To enable the authentication handler function, it must be enabled and added in the `AppConfig` object as follows.

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
