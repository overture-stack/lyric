import type { SubmissionServiceConfig } from '../config/config.js';

// body-parser's own default limit for a JSON body
const JSON_PARSER_DEFAULT_SIZE = 100 * 1024;

/**
 * The body limits the submission router applies, in bytes.
 * - `fileSize`: each uploaded file. `undefined` means no per-file limit.
 * - `jsonSize`: a JSON request body, which holds one entity's records the way a file does.
 * - `requestSize`: a whole upload, every file counted together. `undefined` means no limit on the total.
 */
export type SubmissionBodyLimits = {
	fileSize?: number;
	jsonSize: number;
	requestSize?: number;
};

/**
 * Resolves the submission router's body limits from its configuration. A `0` or omitted `maxFileSize` or
 * `maxRequestSize` sets no limit of that kind. JSON bodies are limited by `maxFileSize`, or by the JSON parser's
 * default of 100kb when `maxFileSize` is `0` or omitted.
 */
export const getSubmissionBodyLimits = (config: SubmissionServiceConfig | undefined): SubmissionBodyLimits => {
	const fileSize = config?.maxFileSize || undefined;
	const requestSize = config?.maxRequestSize || undefined;
	return { fileSize, jsonSize: fileSize ?? JSON_PARSER_DEFAULT_SIZE, requestSize };
};
