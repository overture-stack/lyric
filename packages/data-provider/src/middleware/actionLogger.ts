import type { NextFunction, Response } from 'express';

import type { Logger } from '../config/logger.js';
import { ActionResult, extractActionMetadata, formatActionLog } from '../utils/actionLoggerUtils.js';
import type { RequestWithUser } from './auth.js';

export type ActionLoggerConfig = {
	enabled: boolean;
};

/**
 * Action Logger Middleware
 */
export const actionLoggerMiddleware = (config: ActionLoggerConfig, logger: Logger) => {
	return (req: RequestWithUser, res: Response, next: NextFunction) => {
		// Skip logging if disabled
		if (!config.enabled) {
			return next();
		}

		const startTime = Date.now();

		/**
		 * Log the action after response is sent
		 */
		res.on('finish', () => {
			// Extract metadata now that route has been matched and params are populated
			const metadata = extractActionMetadata(req);
			const duration = Date.now() - startTime;
			const statusResult = res.statusCode >= 200 && res.statusCode < 400 ? ActionResult.ALLOWED : ActionResult.DENIED;

			const logMessage = formatActionLog(metadata, statusResult, res.statusCode, duration);

			if (statusResult === 'DENIED') {
				logger.warn(logMessage);
			} else {
				logger.info(logMessage);
			}
		});

		next();
	};
};
