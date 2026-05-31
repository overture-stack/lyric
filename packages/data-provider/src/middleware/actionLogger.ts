import type { NextFunction, Response } from 'express';

import type { Logger } from '../config/logger.js';
import { ActionResult, extractActionMetadata, formatActionLog } from '../utils/actionLoggerUtils.js';
import type { RequestWithUser } from './auth.js';

export type ActionLoggerConfig = {
	enabled: boolean;
};

/**
 * Action Logger Middleware
 * This middleware should be placed after authMiddleware in the router chain.
 */
export const actionLoggerMiddleware = (config: ActionLoggerConfig, logger: Logger) => {
	return (req: RequestWithUser, res: Response, next: NextFunction) => {
		// Skip logging if disabled
		if (!config.enabled) {
			return next();
		}
		// Extract request metadata
		const metadata = extractActionMetadata(req);
		const startTime = Date.now();

		const logAction = (statusCode: number) => {
			const duration = Date.now() - startTime;
			const statusResult = statusCode >= 200 && statusCode < 400 ? ActionResult.ALLOWED : ActionResult.DENIED;

			const logMessage = formatActionLog(metadata, statusResult, statusCode, duration);

			// Use appropriate log level based on statusCode returned
			if (statusResult === ActionResult.DENIED) {
				logger.warn(logMessage);
				return;
			}
			logger.info(logMessage);
		};

		/**
		 * Log the action after response is sent
		 */
		res.on('finish', () => {
			logAction(res.statusCode);
		});

		next();
	};
};
