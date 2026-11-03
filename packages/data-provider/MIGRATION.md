# Migration Guide

Each section covers one change to something you already use: what changed, who is affected, how to tell, and what to do. Sections are grouped by the release you are upgrading from.

## Upgrading from 0.20.x

<a id="library-error-statuses"></a>

### Errors raised by libraries are answered with their own status

**What changed.** `errorHandler` answers errors raised by multer and by Express middleware such as body-parser with the status they describe:

| Error | Status |
|---|---|
| An upload exceeding one of multer's limits, such as `fileSize` | `413` |
| An upload refused by multer for any other reason, such as a file in an unexpected field | `400` |
| A JSON body over body-parser's limit | `413` |
| A malformed JSON body | `400` |

The response body keeps its `{ error, message, details }` shape, and `error` is still the library's error name, such as `MulterError` or `SyntaxError`. `message` is fixed text, since a library's message can repeat what was submitted: multer's own message, which is already fixed, such as `File too large`; `The request body must be valid JSON` for malformed JSON; and the status's own name, such as `Payload Too Large`, for any other error carrying its own client status. The submission router names its limit instead, as in `JSON request bodies must be at most 10MB`.

**Who is affected.** Any service that mounts Lyric's `errorHandler`, including one that runs its own multer or body-parser in front of it, and any client, test or alert that expects `500` for these failures or retries a `500` automatically.

**How to tell.** A failed upload or JSON request is answered `413` or `400` where it was answered `500`.

**What to do.** Treat these as client errors, which fail the same way when retried unchanged. To send a response of your own for them, use `createErrorHandler` with `uploadErrors` or `clientErrors`, described in the [README](README.md#error-handling).

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

**What is new.** `submissionService.maxRequestSize` limits a whole upload, every file in it counted together. An upload over it is refused with `413` before any of it is read. Once it is set, an upload must declare its size with `Content-Length`, or it is refused with `411`. The library sets no such limit unless configured. Lyric's reference server applies 100 MB by default, read from `SUBMISSION_MAX_REQUEST_SIZE` in bytes. `limitRequestSize`, `ContentTooLarge` and `LengthRequired` are exported for routes of your own.

**Who is affected.** Deployments of Lyric's reference server, where an upload over 100 MB in total is now refused with `413`, and an upload sent without `Content-Length` is now refused with `411`.

**Who should act.** Anyone accepting uploads. A per-file limit, whether `maxFileSize` or multer's own `fileSize`, does not bound how many files arrive in one request.

**What to do.** On the reference server, set `SUBMISSION_MAX_REQUEST_SIZE` if 100 MB does not suit your uploads. As a library, set `maxRequestSize` in `submissionService`. For an upload route of your own, mount `limitRequestSize` ahead of multer:

```javascript
import { limitRequestSize } from '@overture-stack/lyric';
import multer from 'multer';

const upload = multer({ dest: '/tmp', limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/upload', limitRequestSize(100 * 1024 * 1024), upload.array('files'), uploadController);
```

Browsers and common HTTP clients declare `Content-Length` for multipart uploads. A client that streams an upload with chunked transfer encoding needs to set it once a limit is in place.

<a id="authentication-before-body"></a>

### The submission router authenticates before it reads the body

**What changed.** The submission router runs the auth middleware before it parses a request body, so an unauthenticated request is refused without its body being read.

**Who is affected.** A `customAuthHandler` that reads `req.body` for requests to the submission router.

**How to tell.** The handler finds `req.body` unparsed on those requests.

**What to do.** Authenticate from the request's headers, as the README's handler example does.
