export class BadRequest extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Bad Request';
	}
}

export class NotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Not Found';
	}
}

export class StateConflict extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'Conflict';
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

export const getErrorMessage = (error: unknown) => {
	if (error instanceof Error) return error.message;
	return String(error);
};
