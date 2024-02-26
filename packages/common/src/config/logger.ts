import { Logger, LoggerOptions, createLogger, format, transports } from 'winston';
import { LoggerConfig } from './config.js';

export const getLogger = (config: LoggerConfig): Logger => {
	const transportList: LoggerOptions['transports'] = [];

	const { combine, timestamp, simple, colorize, printf } = format;

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
	return logger;
};
