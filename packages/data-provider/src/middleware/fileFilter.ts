import { Request } from 'express';
import type { FileFilterCallback } from 'multer';

import { BadRequest } from '../utils/errors.js';
import { getValidFileExtension, SUPPORTED_FILE_EXTENSIONS } from '../utils/files.js';

/**
 * Middleware function for filtering uploaded files in a Multer-based file upload.
 *
 * Validates that the request contains files and that each file has a valid extension.
 * If the validation fails, it invokes the callback with a `BadRequest` error.
 * Otherwise, it allows the file to be processed.
 *
 * @param req - The Express request object, expected to contain uploaded files.
 * @param file - The file object provided by Multer for the current file being processed.
 * @param cb - The callback function to signal acceptance or rejection of the file.
 *
 * @throws {BadRequest} If the "files" parameter is missing or empty, or if the file extension is invalid.
 */
export const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
	const files = Array.isArray(req.files) ? req.files : [];
	if (!files || files.length === 0) {
		cb(
			new BadRequest('The "files" parameter is missing or empty. Please include files in the request for processing.'),
		);
	}

	if (!getValidFileExtension(file.originalname)) {
		return cb(
			new BadRequest(
				`File '${file.originalname}' has invalid file extension. File extension must be '${SUPPORTED_FILE_EXTENSIONS.options}'.`,
			),
		);
	}

	cb(null, true);
};
