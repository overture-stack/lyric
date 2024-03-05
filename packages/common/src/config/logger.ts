import { LoggerOptions, createLogger, format, transports } from 'winston';
import { LoggerConfig } from './config.js';

export type loggerFunction = (...messages: any[]) => void;

export type Logger = {
	debug: loggerFunction;
	warn: loggerFunction;
	info: loggerFunction;
	error: loggerFunction;
};

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

	const log = (...message: string[]) => {
		const fullMessage = message.join(' - ');
		return fullMessage;
	};

	return {
		debug: (...messages: any[]) => {
			return logger.debug(log(...messages));
		},
		warn: (...messages: any[]) => {
			return logger.warn(log(...messages));
		},
		info: (...messages: any[]) => {
			return logger.info(log(...messages));
		},
		error: (...messages: any[]) => {
			return logger.error(log(...messages));
		},
	};
};
