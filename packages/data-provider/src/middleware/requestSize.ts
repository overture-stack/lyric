import bytes from 'bytes';
import type { RequestHandler } from 'express';

import { ContentTooLarge, LengthRequired } from '../utils/errors.js';

/**
 * Creates Express middleware that refuses a request whose body is larger than `maxRequestSize` bytes, before any of
 * the body is read. The size comes from the `Content-Length` header, and Node's HTTP parser reads no more of the
 * body than it declares, so a request sending a body without one is refused with `LengthRequired`: its size can't
 * be known in advance.
 *
 * Mount it ahead of an upload parser such as multer, whose `fileSize` limit applies to each file rather than to the
 * whole request, so the total of an upload with many files stays bounded.
 * @param maxRequestSize The largest request body accepted, in bytes
 */
export const limitRequestSize =
	(maxRequestSize: number): RequestHandler =>
	(req, _res, next) => {
		const declaredSize = req.headers['content-length'];
		if (declaredSize) {
			return Number(declaredSize) <= maxRequestSize
				? next()
				: next(new ContentTooLarge(`Request content must be at most ${bytes.format(maxRequestSize)}`));
		}
		return req.headers['transfer-encoding'] ? next(new LengthRequired()) : next();
	};
