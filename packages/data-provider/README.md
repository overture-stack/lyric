# Lyric

[![NPM Version](https://img.shields.io/npm/v/@overture-stack/lyric?color=%23cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@overture-stack/lyric)

## Install

```
npm i @overture-stack/lyric
```

When upgrading from an earlier release, see [MIGRATION.md](MIGRATION.md) for changes that need action.

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
		file: false, // When true, writes a plain-text log to logs.log (legacy). Controlled by LOG_FILE env var.
		json: false, // When true, writes a structured JSON log to logs/app.json for log aggregator ingestion (e.g. Kibana). Controlled by LOG_JSON env var.
		level: 'info', // Logging level (e.g., 'debug', 'info', 'warn', 'error'). Controlled by LOG_LEVEL env var.
	},
	schemaService: {
		url: 'https://api.lectern-service.com', // URL of the schema service
	},
	submissionService: {
		maxFileSize: 10 * 1024 * 1024, // Largest file accepted in an upload, and largest JSON request body, in bytes. 0 or omitted: no per-file limit, and JSON bodies keep the JSON parser's 100kb default
		maxRequestSize: 100 * 1024 * 1024, // Largest upload accepted, every file in it counted together, in bytes. 0 or omitted: no limit
	},
};


const lyricProvider = provider(appConfig);
```

### Auth Custom Handler

The **authentication custom handler** is a customizable function that can be used to verify user authentication and grant write and read permissions to organizations. It is used by the auth middleware to process incoming requests before any operation is executed, and to identify the user for audit purposes on these endpoints.

The handler receives an argument of type `Request` and returns a `UserSessionResult` response type, which provides information about the user's session or any errors encountered during the process.

This result `UserSessionResult` object may include the following:

- **user**: A `UserSession` object containing details of the authenticated user:

  ```javascript
  	{
  		username: string;
  		isAdmin: boolean;
  		allowedWriteOrganizations: string[];
  		allowedReadOrganizations: string[];
  	}
  ```

  - **username**: A string representing the user's identifier (e.g., email address).
  - **isAdmin**: A boolean value indicating whether the user has admin privileges. If `true`, the user has write access to all organizations.
  - **allowedWriteOrganizations**: An array of strings representing the organizations to which the user is allowed to write data.
  - **allowedReadOrganizations**: An array of strings representing the organizations to which the user is allowed to read data.

When an authentication error occurs, the system should return the following error details:

- **errorCode**: A numeric code representing an error that occurred while processing the session request.
- **errorMessage**: A descriptive message detailing the specific error, if an errorCode is provided.

> **Note:** To include additional properties in the `UserSession` object (for example: groups, department or any other application specific information), you can create a custom user session type that extends `UserSession`. Example:
>
> ```javascript
> type CustomUserSession = UserSession & {
>   department?: string;
>   groups?: string[];
> };
> ```

Example how to implement a custom auth handler:

```javascript
import { type Request } from 'express';
import { type UserSessionResult } from '@overture-stack/lyric';
import jwt from 'jsonwebtoken';

const authHandler = (req: Request): UserSessionResult<CustomUserSession> => {
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
				allowedWriteOrganizations: decodedToken.writeScopes, // Get the list of organizations the user can write to
				allowedReadOrganizations: decodedToken.readScopes, // Get the list of organizations the user can read
				groups: decodedToken.groups, // List of the groups the user is part of
			 },
		};
	} catch (err) {
		 // If the token is invalid or an error occurs, return an unauthorized error
		return {
			errorCode: 401,
			errorMessage: 'Unauthorized: Invalid token'
		}
	}
};
```

When the handler returns an `errorCode`, the middleware creates the matching Lyric error type with the `errorMessage` and passes it to `errorHandler`, so the response uses the standard `{ error, message, details }` format:

- `400` → `BadRequest`
- `401` → `Unauthorized`
- `403` → `Forbidden`
- `503` → `ServiceUnavailable`
- Any other code → `InternalServerError` (`500`)

A request that requires authentication is rejected with `401 Unauthorized` when the handler returns no `user`.

The handler can also throw a Lyric error directly, for example `throw new ServiceUnavailable('Auth server is unreachable')`, and the response uses that error's status and message. The error classes are exported from `@overture-stack/lyric`. Any other error thrown by the handler is logged and returned as `500 Internal Server Error` with the message `Authorization check failed.`, so its original message is not sent to the client.

To enable the authentication handler function, set `enabled: true` in the auth section of the **AppConfig** object, and provide your custom authentication handler with the `customAuthHandler` property.

By default, all HTTP methods are protected. Optionally, you can specify which methods to protect by setting the `protectedMethods` array (e.g., ['DELETE', 'POST', 'PUT']).

```javascript
import { AppConfig, provider, UserSession } from '@overture-stack/lyric';

const appConfig: AppConfig = {
	...// Other configuration
	auth: {
		enabled: true,
		customAuthHandler: authHandler,
		// Optionally add protected methods
		protectedMethods: ['DELETE', 'POST', 'PUT'],
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

### Error Handling

Mount `errorHandler` after the routers, so every error is answered with a status and a `{ error, message, details }` body:

```javascript
import { errorHandler } from '@overture-stack/lyric';

app.use(errorHandler);
```

| Error | Status |
|---|---|
| A Lyric error type, such as `BadRequest`, `NotFound` or `ContentTooLarge` | The status mapped to that type |
| An error carrying its own client error status, such as body-parser's for a JSON body too large (`413`) or malformed (`400`) | That status, with fixed text |
| Anything else | `500`, with fixed text |

For an error carrying its own client error status, `message` is fixed text, since a library's message can repeat what was submitted: `The request body must be valid JSON` for malformed JSON, and the status's own name, such as `Payload Too Large`, otherwise. `error` is the library's error name, such as `SyntaxError` or `PayloadTooLargeError`.

Mount `convertUploadErrors` after any route that runs multer. It converts an upload refused by multer into a Lyric error: `ContentTooLarge` (`413`) for an upload over one of multer's limits, and `BadRequest` (`400`) otherwise, keeping multer's message, which is fixed text such as `File too large`. Without it, `errorHandler` answers multer's refusal as an unexpected error, with a fixed `500`. Lyric's submission router mounts it for its own uploads; for a route of your own, see [Upload and Request Size Limits](#upload-and-request-size-limits).

An unexpected error is answered with `{ "error": "Internal Server Error", "message": "Something unexpected happened" }`, so nothing about it reaches the client. Its name, message and stack are logged with the request's method and path, under `ERROR_HANDLER`.

An error raised after a response has started, such as partway through a stream, can no longer be answered. It is logged the same way and handed on to Express, which ends the response as failed, so the client never receives it as complete.

Use `createErrorHandler` instead to choose the logger, or to send your own response to the errors carrying their own client error status. The override receives the error and Lyric's default response, and returns the response to send:

```javascript
import { createErrorHandler, getLogger } from '@overture-stack/lyric';

const logger = getLogger({ level: 'info' });

app.use(
	createErrorHandler({
		clientErrors: (error, defaultResponse) => ({ ...defaultResponse, message: 'The request could not be read' }),
		logger,
	}),
);
```

Lyric's own error types are always answered with their mapped status and message. If the override throws, its error is logged and the client error is answered with the fixed `500`.

### File Submission

Files are submitted via `POST /submission/category/:categoryId/files` as a multipart form upload.

By default, parsing runs in the background and `fileResults` will be empty in the response. Pass `sync=true` to wait for parsing and receive per-file results in the response.

| `fileResults[].status` | Meaning |
|---|---|
| `ok` | File parsed successfully with no schema validation errors. |
| `invalid` | File parsed but contains schema validation errors. The submission still proceeds; errors are listed in `parseErrors` (field names and line numbers only). |
| `error` | File could not be read or parsed at all (e.g. corrupt stream, bad encoding). No records from this file were stored. |

**`sync` query parameter**

By default (`sync=false`), the endpoint returns immediately and parsing runs in the background. Pass `sync=true` to wait for results:

```
POST /submission/category/1/files?sync=true
```

When `sync=true`, `fileResults` will be populated in the response with per-file outcomes. Without it, parse errors are logged on the server but not returned to the caller. Avoid `sync=true` on very large batches where parsing time would exceed your client's request timeout.

### Upload and Request Size Limits

The submission router applies the limits set in `submissionService`:

| Setting | Limits | Refused with |
|---|---|---|
| `maxFileSize` | Each uploaded file, and each JSON request body, which holds one entity's records the way a file does | `413`, naming the limit |
| `maxRequestSize` | A whole upload, every file counted together | `413`, naming the limit |

When `maxFileSize` is `0` or omitted, JSON bodies keep the JSON parser's default limit of 100kb.

A per-file limit does not bound how many files arrive in one request, so set `maxRequestSize` wherever uploads are accepted. When it is set, the size of an upload is checked against its `Content-Length` header before any of it is read, and an upload sent without one is refused with `411`. Browsers and common HTTP clients declare it for multipart uploads; a client that streams an upload with chunked transfer encoding needs to set it.

The submission router authenticates a request before it reads the body, so an unauthenticated request is refused without its body being parsed.

For an upload route of your own, mount `limitRequestSize` ahead of multer, and `convertUploadErrors` after the route, so multer's refusals reach `errorHandler` as Lyric errors:

```javascript
import { convertUploadErrors, limitRequestSize } from '@overture-stack/lyric';
import multer from 'multer';

const upload = multer({ dest: '/tmp', limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/upload', limitRequestSize(100 * 1024 * 1024), upload.array('files'), uploadController);
router.use(convertUploadErrors);
```

### Provider Shut down

When the application exits, call `shutdown()` on the provider to gracefully terminate the internal worker thread pool. This allows any in-progress operation running on worker threads to finish before the process exits, preventing data corruption or incomplete writes.

It is recommended to handle both `SIGTERM` (sent by orchestrators like Kubernetes or Docker) and `SIGINT` (sent by Ctrl+C during local development):

```javascript
const gracefulShutdown = async (signal) => {
	console.log(`Received ${signal}, shutting down…`);

	// 1. Stop accepting new requests
	server.close();

	// 2. Drain and terminate worker threads
	await lyricProvider.shutdown();

	// 3. Close any other resources (e.g. database pool, cache clients)
	// await db.end();

	process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

> **Note:** Worker pool initialisation happens at provider startup. If it fails (for example due to a missing worker script or unsupported Node.js version), an error is thrown immediately and the application will not start.

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
