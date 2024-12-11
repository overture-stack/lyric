import type { UserSession } from '../utils/express.js';

// Extends the Request interface to include a custom `user` object
declare module 'express-serve-static-core' {
	interface Request {
		user?: UserSession;
	}
}
