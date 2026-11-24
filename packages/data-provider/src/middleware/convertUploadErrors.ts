import type { ErrorRequestHandler } from 'express';

import { BadRequest, ContentTooLarge } from '../utils/errors.js';

// multer's codes for an upload exceeding one of its configured limits; its other codes describe a malformed upload.
const UPLOAD_LIMIT_CODES: ReadonlySet<string> = new Set([
	'LIMIT_FIELD_COUNT',
	'LIMIT_FIELD_KEY',
	'LIMIT_FIELD_VALUE',
	'LIMIT_FILE_COUNT',
	'LIMIT_FILE_SIZE',
	'LIMIT_PART_COUNT',
]);

// Matched by name and code rather than with `instanceof`, so an error from a service's own copy of multer matches too.
const isMulterError = (error: unknown): error is Error & { code: string } =>
	error instanceof Error && error.name === 'MulterError' && 'code' in error && typeof error.code === 'string';

/**
 * Express error middleware that converts an upload refused by multer into a Lyric error, keeping multer's message,
 * which is fixed text:
 * - `ContentTooLarge` for an upload over one of multer's limits;
 * - `BadRequest` for any other refusal.
 *
 * Every other error passes on unchanged. A `MulterError` from any copy of multer is recognized, by its name and code.
 * It acts only on errors raised before it in the middleware chain, and never throws.
 */
export const convertUploadErrors: ErrorRequestHandler = (error, _req, _res, next) => {
	if (isMulterError(error)) {
		return next(
			UPLOAD_LIMIT_CODES.has(error.code) ? new ContentTooLarge(error.message) : new BadRequest(error.message),
		);
	}
	return next(error);
};
