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
