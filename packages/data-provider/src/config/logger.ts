import { createLogger, format, LoggerOptions, transports } from 'winston';

import { LoggerConfig } from './config.js';

export type loggerFunction = (...messages: unknown[]) => void;

export type Logger = {
	debug: loggerFunction;
	warn: loggerFunction;
	info: loggerFunction;
	error: loggerFunction;
};

/**
 * Get a Logger instance for log messages
 * @param config logger configuration
 * @returns functions to log messages based on each log level
 */
export const getLogger = (config: LoggerConfig): Logger => {
	const transportList: LoggerOptions['transports'] = [];

	const { combine, timestamp, colorize, printf } = format;

	// console transport
	const consoleLog = new transports.Console({
		format: combine(
			timestamp(),
			colorize(),
			printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`),
		),
	});
	transportList.push(consoleLog);

	// file transport
	if (config.file) {
		const fileLog = new transports.File({ filename: 'logs.log' });
		transportList.push(fileLog);
	}

	const logger = createLogger({
		level: config.level || 'info',
		transports: transportList,
	});

	const log = (...message: unknown[]) => {
		const fullMessage = message.join(' - ');
		return fullMessage;
	};

	return {
		debug: (...messages: unknown[]) => {
			return logger.debug(log(...messages));
		},
		warn: (...messages: unknown[]) => {
			return logger.warn(log(...messages));
		},
		info: (...messages: unknown[]) => {
			return logger.info(log(...messages));
		},
		error: (...messages: unknown[]) => {
			return logger.error(log(...messages));
		},
	};
};
