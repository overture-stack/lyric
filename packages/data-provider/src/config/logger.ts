import { createLogger, format, transports } from 'winston';

import { LoggerConfig } from './config.js';

export type loggerFunction = (...messages: unknown[]) => void;

export type Logger = {
	debug: loggerFunction;
	warn: loggerFunction;
	info: loggerFunction;
	error: loggerFunction;
};

/**
 * Splits a variadic argument list into a message string and optional structured metadata object.
 * When the last argument is a plain object (not an Error, array, or null), it is treated as metadata.
 */
const splitArgs = (messages: unknown[]): { message: string; meta?: Record<string, unknown> } => {
	const last = messages[messages.length - 1];
	const isMetaObject =
		last !== null &&
		last !== undefined &&
		typeof last === 'object' &&
		!Array.isArray(last) &&
		!(last instanceof Error);
	if (isMetaObject && messages.length > 1) {
		return { message: messages.slice(0, -1).join(' - '), meta: last as Record<string, unknown> };
	}
	return { message: messages.join(' - ') };
};

/** Renders a metadata object as `key=value` pairs for human-readable console output. */
const metaToString = (meta: Record<string, unknown>): string =>
	Object.entries(meta)
		.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
		.join(' ');

/**
 * Get a Logger instance for log messages.
 * Console transport emits human-readable `key=value` metadata.
 * When `config.json` is true, a separate JSON file transport writes structured logs to `logs/app.json`
 * for ingestion by log aggregators (e.g. Kibana).
 */
export const getLogger = (config: LoggerConfig): Logger => {
	const { combine, timestamp, colorize, errors, json, printf } = format;

	const consoleTransport = new transports.Console({
		format: combine(
			errors({ stack: true }),
			timestamp(),
			colorize(),
			printf(({ timestamp, level, message, meta }) => {
				const metaPart = meta ? ` ${metaToString(meta as Record<string, unknown>)}` : '';
				return `${timestamp} [${level}]: ${message}${metaPart}`;
			}),
		),
	});

	const transportList = [consoleTransport];

	if (config.json) {
		const jsonTransport = new transports.File({
			filename: 'logs/app.json',
			format: combine(errors({ stack: true }), timestamp(), json()),
		});
		transportList.push(jsonTransport);
	}

	const logger = createLogger({
		level: config.level || 'info',
		transports: transportList,
	});

	const emit =
		(fn: (message: string, meta?: object) => void) =>
		(...messages: unknown[]) => {
			const { message, meta } = splitArgs(messages);
			fn(message, meta ? { meta } : undefined);
		};

	return {
		debug: emit((msg, meta) => logger.debug(msg, meta)),
		warn: emit((msg, meta) => logger.warn(msg, meta)),
		info: emit((msg, meta) => logger.info(msg, meta)),
		error: emit((msg, meta) => logger.error(msg, meta)),
	};
};
