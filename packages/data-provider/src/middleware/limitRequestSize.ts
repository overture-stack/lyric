import bytes from 'bytes';
import type { RequestHandler } from 'express';

import { BadRequest, ContentTooLarge, LengthRequired } from '../utils/errors.js';

/**
 * Creates Express middleware that refuses a request whose declared body size is over `maxRequestSize` bytes,
 * reading none of the body. It passes `next` one of:
 * - `ContentTooLarge`, naming the limit, when `Content-Length` is over `maxRequestSize`;
 * - `BadRequest` when `Content-Length` is not a whole number of bytes;
 * - `LengthRequired` when the request has a body and no `Content-Length`, since its size cannot be known in advance.
 *
 * A request without a body passes. There is no value meaning no limit: `0` passes only an empty body.
 */
export const limitRequestSize =
	(maxRequestSize: number): RequestHandler =>
	(req, _res, next) => {
		// Node's HTTP parser reads no more of the body than Content-Length declares, so the declared size bounds it
		const declaredSize = req.headers['content-length'];
		if (declaredSize) {
			const size = Number(declaredSize);
			if (Number.isInteger(size) && size >= 0) {
				return size <= maxRequestSize
					? next()
					: next(new ContentTooLarge(`Request content must be at most ${bytes.format(maxRequestSize)}`));
			}
			return next(new BadRequest('Content-Length must be a whole number of bytes'));
		}
		return req.headers['transfer-encoding'] ? next(new LengthRequired()) : next();
	};
