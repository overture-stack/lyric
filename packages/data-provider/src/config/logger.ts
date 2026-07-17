import { createLogger, format, transport, transports } from 'winston';

import { LoggerConfig } from './config.js';

export type loggerFunction = (...messages: unknown[]) => void;

export type Logger = {
	debug: loggerFunction;
	warn: loggerFunction;
	info: loggerFunction;
	error: loggerFunction;
};

/**
 * Splits variadic logger arguments into a text message and an optional metadata object.
 * If the last argument is a plain object it is treated as structured metadata; all preceding
 * arguments are joined with ' - ' to form the message string.
 */
const splitArgs = (messages: unknown[]): { message: string; meta?: Record<string, unknown> } => {
	const last = messages[messages.length - 1];
	const isMetaObject =
		last !== null && last !== undefined && typeof last === 'object' && !Array.isArray(last) && !(last instanceof Error);

	if (isMetaObject && messages.length > 1) {
		return {
			message: messages.slice(0, -1).join(' - '),
			meta: last as Record<string, unknown>,
		};
	}

	return { message: messages.join(' - ') };
};

/** Renders a metadata object as space-separated key=value pairs for human-readable output. */
const metaToString = (meta: Record<string, unknown>): string =>
	Object.entries(meta)
		.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
		.join(' ');

/**
 * Get a Logger instance for log messages.
 *
 * Supports two transports:
 * - Console: human-readable `timestamp [level]: message key=value ...` format, always active.
 * - JSON file (`logs/app.json`): full structured JSON for log aggregators; enabled via `config.json`.
 */
export const getLogger = (config: LoggerConfig): Logger => {
	const transportList: transport[] = [];

	const { combine, timestamp, colorize, printf, json, errors } = format;

	// Console transport: human-readable with metadata rendered as key=value pairs.
	transportList.push(
		new transports.Console({
			format: combine(
				timestamp(),
				colorize(),
				errors({ stack: true }),
				printf(({ timestamp, level, message, ...meta }) => {
					const metaKeys = Object.keys(meta).filter((k) => k !== 'stack');
					const metaStr = metaKeys.length ? ' ' + metaToString(meta as Record<string, unknown>) : '';
					return `${timestamp} [${level}]: ${message}${metaStr}`;
				}),
			),
		}),
	);

	// Plain-text file transport (legacy; kept for backwards compatibility).
	if (config.file) {
		transportList.push(new transports.File({ filename: 'logs.log' }));
	}

	// JSON file transport for log aggregators (Kibana via Filebeat, etc.).
	if (config.json) {
		transportList.push(
			new transports.File({
				filename: 'logs/app.json',
				format: combine(timestamp(), errors({ stack: true }), json()),
			}),
		);
	}

	const logger = createLogger({
		level: config.level || 'info',
		transports: transportList,
	});

	const emit =
		(fn: (message: string, meta?: object) => void) =>
		(...messages: unknown[]) => {
			const { message, meta } = splitArgs(messages);
			fn(message, meta);
		};

	return {
		debug: emit(logger.debug.bind(logger)),
		warn: emit(logger.warn.bind(logger)),
		info: emit(logger.info.bind(logger)),
		error: emit(logger.error.bind(logger)),
	};
};
