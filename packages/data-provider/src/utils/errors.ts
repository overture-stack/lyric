export class BadRequest extends Error {
	constructor(msg: string, details?: unknown) {
		super(msg);
		this.name = 'Bad Request';
		this.cause = details;
	}
}

/**
 * Error for requests that require authentication but do not identify a user.
 * Maps to HTTP 401. Use `Forbidden` instead when the user is known but lacks permission.
 */
export class Unauthorized extends Error {
	constructor(msg?: string) {
		super(msg || 'Authentication is required to access this resource');
		this.name = 'Unauthorized';
	}
}

export class Forbidden extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Forbidden';
	}
}

export class NotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Not Found';
	}
}

export class StatusConflict extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Conflict';
	}
}

/**
 * Error for a request that sends a body without declaring its size in `Content-Length`, where the size has to be
 * checked before the body is read. Maps to HTTP 411.
 */
export class LengthRequired extends Error {
	constructor(msg?: string) {
		super(msg || 'Requests to this endpoint must declare their size with a Content-Length header');
		this.name = 'Length Required';
	}
}

/**
 * Error for a request whose content exceeds a size limit, such as an uploaded file larger than the configured
 * maximum. Maps to HTTP 413. The message should name the limit, so the client knows how far to shrink or split.
 */
export class ContentTooLarge extends Error {
	constructor(msg?: string) {
		super(msg || 'Request content is larger than the server accepts');
		this.name = 'Content Too Large';
	}
}

export class TSVParseError extends Error {
	constructor(msg?: string) {
		super(msg || `TSV file is formatted incorrectly`);
		this.name = 'Parse Error';
	}
}

export class NotImplemented extends Error {
	constructor(msg?: string) {
		super(msg || 'This functionallity is not yet implemented');
		this.name = 'Not Implemented';
	}
}

export class ServiceUnavailable extends Error {
	constructor(msg?: string) {
		super(msg || 'Server is unable to access the necessary resources to process the request. Please try again later.');
		this.name = 'Service unavailable';
	}
}

export class InternalServerError extends Error {
	constructor(msg?: string) {
		super(msg || 'Something unexpected happened');
		this.name = 'Internal Server Error';
	}
}

/**
 * The Lyric error types that `errorHandler` maps to a specific HTTP status code.
 * Errors of any other type are returned as `500 Internal Server Error`.
 */
export const LYRIC_ERROR_TYPES = [
	BadRequest,
	Unauthorized,
	Forbidden,
	NotFound,
	StatusConflict,
	LengthRequired,
	ContentTooLarge,
	TSVParseError,
	InternalServerError,
	NotImplemented,
	ServiceUnavailable,
] as const;

export const getErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};
