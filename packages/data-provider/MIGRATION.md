# Migration Guide

Each section covers one change to something you already use: what changed, who is affected, how to tell, and what to do. Sections are grouped by the release you are upgrading from.

## Upgrading from 0.22.x

<a id="worker-pool-max-workers"></a>

### The worker pool runs at most one worker by default

**What changed.** Validations, commits and dictionary migrations run in a pool of workers, and the pool now runs at most `workerPool.maxWorkers` of them at the same time: `1` unless configured. A task that arrives while every worker is busy waits in a queue and starts as soon as a worker is free. No task is refused or dropped for lack of a worker. Previously the pool's limit was the machine's CPU count less one, which inside a container counts the whole node, not the container's CPU limit.

For example, with the default of `1`, three submissions uploaded at the same time are validated one after another: the first starts at once, and the second and third stay in `VALIDATING` until the ones ahead of them finish. With `maxWorkers: 3`, all three are validated at the same time.

**Who is affected.** Deployments that run several validations, commits or dictionary migrations at the same time.

**How to tell.** Under concurrent load, a submission can stay in `VALIDATING`, or a commit in `COMMITTING`, for longer, while it waits for a free worker.

**What to do.** Nothing, unless the wait is too long. To run more at once, set `workerPool.maxWorkers` in `AppConfig`, or `WORKER_POOL_MAX_WORKERS` on the reference server. Keep it at most one less than the CPUs given to Lyric (on Kubernetes, the pod's `limits.cpu`), and within its memory and database connections. [Choosing a value](README.md#choosing-a-value) shows how to work it out, and what happens when it exceeds the available CPUs.

## Upgrading from 0.21.x

<a id="administrator-routes"></a>

### Registering a dictionary and changing a category alias require an administrator

While auth is enabled, these require a user whose `isAdmin` is `true`, on every method, regardless of `protectedMethods`, through Lyric's routers and `provider().controllers` alike:

- `POST /dictionary/register` (`dictionary.registerDictionary`)
- `PUT /category/:categoryId/alias` (`category.assignAlias`)
- `DELETE /category/:categoryId/alias` (`category.unassignAlias`)

Make these calls as an administrator, with credentials even on a method left out of `protectedMethods`. A user who is not an administrator gets `403`.

<a id="per-route-authentication"></a>

### Lyric's routers authenticate only requests handled by their own routes

A request matching no Lyric route passes through a Lyric router without being authenticated. So a route of your own, registered after a Lyric router on the same path, gets no `req.user` from Lyric and is not refused by it: authenticate it with middleware of your own. Under a Lyric router's path, a request to a path matching no route reaches your application's 404 handling.

## Upgrading from 0.20.x

<a id="library-error-statuses"></a>

### Errors raised by libraries are answered with their own status

**What changed.** These errors are answered with the status they describe:

| Error | Status |
|---|---|
| A JSON body over body-parser's limit | `413` |
| A malformed JSON body | `400` |
| Any other error carrying a client error status, such as a route parameter Express can't decode | That status |
| An upload exceeding one of multer's limits, such as `fileSize`, once converted by `convertUploadErrors` | `413` |
| An upload refused by multer for any other reason, such as a file in an unexpected field, once converted by `convertUploadErrors` | `400` |

`convertUploadErrors` converts multer's refusals into Lyric errors before `errorHandler` answers them. Lyric's submission router mounts it for its own uploads, and Lyric exports it for upload routes of your own.

The response body keeps its `{ error, message, details }` shape. `message` is fixed text, since a library's message can repeat what was submitted: `The request body must be valid JSON` for malformed JSON; the status's own name, such as `Payload Too Large`, for any other error carrying its own client status; and multer's own message, which is already fixed, such as `File too large`, for a converted upload. `error` is the library's error name, such as `SyntaxError`, or the Lyric error's name, `Content Too Large` or `Bad Request`, for a converted upload. The submission router names its limit instead, as in `JSON request bodies must be at most 10MB`.

**Who is affected.** Any service that mounts Lyric's `errorHandler`, especially one with an upload route of its own that runs multer, and any client, test or alert that expects `500` for these failures or retries a `500` automatically.

**How to tell.** A failed upload or JSON request is answered `413` or `400` where it was answered `500`.

**What to do.** Treat these as client errors, which fail the same way when retried unchanged. On an upload route of your own that runs multer, mount `convertUploadErrors` after the route; without it, multer's refusals are answered as unexpected errors, with a fixed `500`. To send a response of your own for errors carrying their own client status, use `createErrorHandler` with `clientErrors`, described in the [README](README.md#error-handling).

<a id="unexpected-error-response"></a>

### Unexpected errors are answered with fixed text and logged

**What changed.** An error that is neither a Lyric error type nor one carrying its own client error status is answered with `500` and this fixed body:

```json
{ "error": "Internal Server Error", "message": "Something unexpected happened" }
```

The error's name, message and stack are logged with the request's method and path, under `ERROR_HANDLER`, and are not part of the response.

**Who is affected.** A client or test that reads `message` or `details` from a `500` response, and anyone who diagnoses failures from those responses.

**How to tell.** Every `500` from an unexpected error now carries the same text.

**What to do.** Read the detail from the server log. `errorHandler` logs to the console; to log through your own logger, mount `createErrorHandler({ logger })` instead.

<a id="max-file-size-zero"></a>

### `maxFileSize: 0` sets no per-file limit

**What changed.** `submissionService.maxFileSize` set to `0`, or omitted, sets no per-file limit on the submission router, as documented. Previously, `0` refused every non-empty uploaded file, and `0` or omitted refused every non-empty JSON body.

**Who is affected.** A service that mounts `routers.submission` with `maxFileSize` set to `0` or omitted.

**How to tell.** Uploads or JSON submissions to those routes were refused whatever their size.

**What to do.** Nothing, unless `0` was relied on to refuse uploads. JSON bodies are limited by `maxFileSize`, or by the JSON parser's default of 100kb when it is `0` or omitted, so set `maxFileSize` to accept larger JSON submissions.

<a id="request-size-limit"></a>

### New: a limit on the total size of an upload

**What is new.** `submissionService.maxRequestSize` limits a whole upload, every file in it counted together. An upload over it is refused with `413` before any of it is read. Once it is set, an upload must declare its size with `Content-Length`, or it is refused with `411`. The library sets no such limit unless configured. Lyric's reference server applies 100 MB by default, read from `SUBMISSION_MAX_REQUEST_SIZE` in bytes. `limitRequestSize`, `convertUploadErrors`, `ContentTooLarge` and `LengthRequired` are exported for routes of your own.

**Who is affected.** Deployments of Lyric's reference server, where an upload over 100 MB in total is now refused with `413`, and an upload sent without `Content-Length` is now refused with `411`.

**Who should act.** Anyone accepting uploads. A per-file limit, whether `maxFileSize` or multer's own `fileSize`, does not bound how many files arrive in one request.

**What to do.** On the reference server, set `SUBMISSION_MAX_REQUEST_SIZE` if 100 MB does not suit your uploads. As a library, set `maxRequestSize` in `submissionService`. For an upload route of your own, mount `limitRequestSize` ahead of multer, and `convertUploadErrors` after the route:

```javascript
import { convertUploadErrors, limitRequestSize } from '@overture-stack/lyric';
import multer from 'multer';

const upload = multer({ dest: '/tmp', limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/upload', limitRequestSize(100 * 1024 * 1024), upload.array('files'), uploadController);
router.use(convertUploadErrors);
```

Browsers and common HTTP clients declare `Content-Length` for multipart uploads. A client that streams an upload with chunked transfer encoding needs to set it once a limit is in place.

<a id="authentication-before-body"></a>

### The submission router authenticates before it reads the body

**What changed.** The submission router runs the auth middleware before it parses a request body, so an unauthenticated request is refused without its body being read.

**Who is affected.** A `customAuthHandler` that reads `req.body` for requests to the submission router.

**How to tell.** The handler finds `req.body` unparsed on those requests.

**What to do.** Authenticate from the request's headers, as the README's handler example does.

<a id="auth-handler-error-code"></a>

### A custom auth handler's refusal is answered by `errorHandler`

**What changed.** When a `customAuthHandler` returns an `errorCode`, the auth middleware passes the matching Lyric error to `errorHandler` rather than answering the request itself, so the refusal takes `errorHandler`'s `{ error, message }` shape, as in `{ "error": "Unauthorized", "message": "Unauthorized: No token provided" }`. An `errorCode` of `400`, `401`, `403` or `503` keeps its status. Any other `errorCode` is answered `500` as `InternalServerError`, with the handler's `errorMessage` as its `message`.

**Who is affected.** A service whose `customAuthHandler` returns an `errorCode`, and any client or test that reads the body of a refusal. A service that answers Lyric's errors with an error handler of its own now receives these refusals as Lyric errors too.

**How to tell.** A refusal carries `error` alongside `message`, and an `errorCode` outside those four statuses is answered `500`.

**What to do.** Read `message` as before. For a status outside those four, throw the Lyric error of that status from the handler, where one exists, as the [next section](#auth-handler-throws) describes.

<a id="auth-handler-throws"></a>

### An error thrown by a custom auth handler is answered according to its type

**What changed.** A Lyric error thrown by a `customAuthHandler`, such as `Unauthorized` or `ServiceUnavailable`, is answered with that error's status and message. Any other error it throws is answered `500`, with the message `Authorization check failed.`, and its own message is logged rather than sent. In 0.20.x, both were answered `403`, `Forbidden: Invalid token`.

**Who is affected.** A service whose handler lets an error escape, most commonly the error a token library throws for an expired or invalid token, as `jwt.verify` does.

**How to tell.** Requests with an expired or invalid token are answered `500` where they were answered `403`, and each one logs `Error thrown validating user auth`.

**What to do.** Catch the token library's error and return `errorCode: 401`, as the [README's handler example](README.md#auth-custom-handler) does, or throw `Unauthorized`. When the identity provider can't be reached, throw `ServiceUnavailable`, so the client is told to try again rather than that its credentials were refused.

<a id="auth-handler-no-user"></a>

### A request is authenticated only when the handler returns a user

**What changed.** A request that requires authentication is refused with `401`, `User is not authenticated`, when the `customAuthHandler` returns neither `user` nor `errorCode`, or when auth is enabled with no `customAuthHandler` configured.

**Who is affected.** A service whose handler can return neither `user` nor `errorCode`, or that enables auth without a handler.

**How to tell.** Those requests are answered `401`, `User is not authenticated`.

**What to do.** Return a `user` for every request the handler accepts, and an `errorCode` for every one it refuses. To leave a method unauthenticated, omit it from `protectedMethods`.

<a id="submitted-data-read-requires-user"></a>

### Reading submitted data by category requires a user wherever auth applies

**What changed.** When auth protects a request's method, `getSubmittedDataByCategory` and `getSubmittedDataByCategoryStream` answer `403` unless `req.user` holds the user's `UserSession`. Behind `routers.submittedData`, the auth middleware refuses such a request first, with `401`.

**Who is affected.** A service that calls those controllers from a route of its own.

**How to tell.** Those routes answer `403`, `User is not authorized to read submitted data`, for requests that reach the controller without `req.user`.

**What to do.** Set `req.user` to the authenticated user's `UserSession` before calling the controller.

<a id="submitted-data-read-without-auth"></a>

### Reading submitted data by category returns every organization wherever auth does not apply

**What changed.** When auth is disabled or does not protect a request's method, `getSubmittedDataByCategory` and `getSubmittedDataByCategoryStream` answer with every organization's records, whatever `req.user` holds, as the other submitted data controllers do.

**Who is affected.** A service that sets `req.user` itself on requests Lyric's auth does not protect, such as one that authenticates requests before they reach Lyric and disables Lyric's auth.

**How to tell.** A user receives records from organizations outside the user's `allowedReadOrganizations`.

**What to do.** To limit a user's reads to the user's organizations, have Lyric's auth protect the method: enable auth, and include `GET` in `protectedMethods` or omit `protectedMethods`.
