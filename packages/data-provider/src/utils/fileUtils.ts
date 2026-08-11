import bytes, { type Unit } from 'bytes';
import { parse as csvParse } from 'csv-parse';
import firstline from 'firstline';
import fs from 'fs';
import { z } from 'zod';

import {
	type DataRecord,
	parse,
	type ParseSchemaError,
	type Schema,
	type UnprocessedDataRecord,
} from '@overture-stack/lectern-client';

import { getSubmittedFileType } from '../services/submission/submissionFile.js';
import { failure, success, type Result } from './result.js';
import { BATCH_ERROR_TYPE, type BatchError } from './types.js';

export const SUPPORTED_FILE_EXTENSIONS = z.enum(['tsv', 'csv']);
export type SupportedFileExtension = z.infer<typeof SUPPORTED_FILE_EXTENSIONS>;

export const columnSeparatorValue = {
	tsv: '\t',
	csv: ',',
} as const satisfies Record<SupportedFileExtension, string>;

/**
 * Determines the separator character for a given file based on its extension.
 * @param file The name of the file whose extension determines the separator character.
 * @returns The separator character associated with the file extension, or `undefined` if
 *          the file extension is invalid or unrecognized.
 */
export const getSeparatorCharacter = (file: Express.Multer.File): string | undefined => {
	const fileExtension = getSubmittedFileType(file);
	if (fileExtension.success) {
		return columnSeparatorValue[fileExtension.data];
	}
	return;
};

/**
 * Maps a record array to an object with keys from headers, formatting each value for compatibility.
 * @param headers An array of header names, used as keys for the returned object.
 * @param record An array of values corresponding to each header, to be formatted and mapped.
 * @returns An `UnprocessedDataRecord` object where each header in `headers` is a key,
 *          and each value is the corresponding entry in `record` formatted for compatibility.
 */
export const mapRecordToHeaders = (headers: string[], record: string[]): UnprocessedDataRecord =>
	Object.fromEntries(headers.map((key, index) => [key, formatForExcelCompatibility(record[index] || '')]));

/**
 * Reads only first line of the file
 * Usefull when file is too large and we're only interested in column names
 * @param file A file we want to read
 * @returns a string with the content of the first line of the file
 */
export const readHeaders = async (file: Express.Multer.File) => {
	return firstline(file.path);
};

/** Collects all raw rows from a delimited file stream, then cleans up the temp file. */
const collectRows = (filePath: string, separator: string): Promise<string[][]> =>
	new Promise((resolve, reject) => {
		const rows: string[][] = [];
		const source = fs.createReadStream(filePath);
		const parser = source.pipe(csvParse({ delimiter: separator }));
		// source errors (e.g. ENOENT, EACCES) fire on the ReadStream and do NOT propagate
		// through pipe() to the transform. Without this, a missing file causes an unhandled
		// rejection that escapes the try/catch in the caller.
		source.on('error', (err) => reject(err));
		parser.on('data', (row: string[]) => rows.push(row));
		parser.on('end', () => resolve(rows));
		// parser errors (e.g. malformed CSV) fire on the transform stream, not the source.
		parser.on('error', (err) => reject(err));
		parser.on('close', () => {
			parser.destroy();
			source.destroy();
			fs.unlink(filePath, () => {});
		});
	});

/**
 * Reads a text file and parses it to typed records.
 * Returns all records (valid or not) and a separate list of per-row schema validation errors.
 * Supported file types: .tsv and .csv
 */
export const readTextFile = async (
	file: Express.Multer.File,
	schema: Schema,
): Promise<{ records: DataRecord[]; errors: ParseSchemaError[] }> => {
	const separator = getSeparatorCharacter(file);
	if (!separator) {
		throw new Error('Invalid file extension');
	}

	const rows = await collectRows(file.path, separator);
	const [headerRow, ...dataRows] = rows;
	if (!headerRow) {
		return { records: [], errors: [] };
	}
	const headers = Object.values(headerRow);

	const parsed = dataRows.map((row, index) => {
		const lineNumber = index + 2; // +1 for header row, +1 for 1-based line numbers
		const result = parse.parseRecordValues(mapRecordToHeaders(headers, row), schema);
		const error = result.success ? undefined : { recordErrors: result.data.errors, recordIndex: lineNumber };
		return { record: result.data.record, error };
	});

	return {
		records: parsed.map((p) => p.record),
		errors: parsed.flatMap((p) => (p.error ? [p.error] : [])),
	};
};

function formatForExcelCompatibility(data: string) {
	// tsv exported from excel might add double quotations to indicate string and escape double quotes
	// this function removes those extra double quatations from a given string

	return data
		.trim()
		.replace(/^"/, '') // excel might add a beginning double quotes to indicate string
		.replace(/"$/, '') // excel might add a trailing double quote to indicate string
		.replace(/""/g, '"') // excel might've used a second double quote to escape a double quote in a string
		.trim();
}

export function getSizeInBytes(size: string | number): number {
	// Parse the string value into an integer in bytes.
	// If value is a number it is assumed is in bytes.
	return bytes.parse(size) || 0;
}

/**
 * Formats a file size from bytes to a specified unit with a defined precision.
 *
 * @param sizeInBytes - The file size in bytes to be formatted.
 * @param unit - The unit to which the size should be converted (e.g., 'MB', 'GB').
 * @param precision - The number of decimal places to include in the formatted output.
 * @returns The file size formatted as a string in the specified unit with the given precision. Returns null if sizeInBytes is not a Finite number.
 *
 */
export const formatByteSize = (sizeInBytes: number, unit: Unit, precision: number): string | null => {
	// Returns null if sizeInBytes is not Finite
	return bytes.format(sizeInBytes, { unit, decimalPlaces: precision });
};

type FileProcessingResult = {
	validFiles: Express.Multer.File[];
	fileErrors: BatchError[];
};

const classifyFile = async (file: Express.Multer.File): Promise<Result<Express.Multer.File, BatchError>> => {
	try {
		if (!getSubmittedFileType(file).success) {
			return failure({
				type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
				message: `File '${file.originalname}' has invalid file extension. File extension must be '${SUPPORTED_FILE_EXTENSIONS.options}'`,
				batchName: file.originalname,
			});
		}
		const headers = await readHeaders(file);
		return headers.includes('systemId')
			? success(file)
			: failure({
					type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
					message: `File '${file.originalname}' is missing the column 'systemId'`,
					batchName: file.originalname,
				});
	} catch {
		return failure({
			type: BATCH_ERROR_TYPE.FILE_READ_ERROR,
			message: `Error reading file '${file.originalname}'`,
			batchName: file.originalname,
		});
	}
};

/**
 * Validates an array of uploaded files in parallel, checking extension and required headers.
 * Returns files that passed validation and batch errors for those that did not.
 */
export const processFiles = async (files: Express.Multer.File[]): Promise<FileProcessingResult> => {
	const outcomes = await Promise.all(files.map(classifyFile));
	return {
		validFiles: outcomes.filter((o) => o.success).map((o) => o.data),
		fileErrors: outcomes.filter((o) => !o.success).map((o) => o.data),
	};
};
