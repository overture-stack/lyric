import bytes, { type Unit } from 'bytes';
import { parse as csvParse } from 'csv-parse';
import firstline from 'firstline';
import fs from 'fs';
import z from 'zod';

import { type Schema, type UnprocessedDataRecord } from '@overture-stack/lectern-client';

import { BATCH_ERROR_TYPE, type BatchError } from './types.js';

export const SUPPORTED_FILE_EXTENSIONS = z.enum(['tsv', 'csv']);
export type SupportedFileExtensions = z.infer<typeof SUPPORTED_FILE_EXTENSIONS>;

const systemIdColumn = 'systemId' as const;

export const columnSeparatorValue = {
	tsv: '\t',
	csv: ',',
} as const satisfies Record<SupportedFileExtensions, string>;

export const extractEntityNameFromFileName = (filename: string) => {
	return filename.split('.')[0]?.toLowerCase();
};

/**
 * Formats a file size from bytes to a specified unit with a defined precision.
 *
 * @param sizeInBytes - The file size in bytes to be formatted.
 * @param unit - The unit to which the size should be converted (e.g., 'MB', 'GB').
 * @param precision - The number of decimal places to include in the formatted output.
 * @returns The file size formatted as a string in the specified unit with the given precision.
 *
 */
export const formatByteSize = (sizeInBytes: number, unit: Unit, precision: number) => {
	return bytes.format(sizeInBytes, { unit, decimalPlaces: precision });
};

/**
 * tsv exported from excel might add double quotations to indicate string and escape double quotes
 * this function removes those extra double quatations from a given string
 * @param data
 * @returns
 */
export const formatForExcelCompatibility = (data: string) => {
	return data
		.trim()
		.replace(/^"/, '') // excel might add a beginning double quotes to indicate string
		.replace(/"$/, '') // excel might add a trailing double quote to indicate string
		.replace(/""/g, '"') // excel might've used a second double quote to escape a double quote in a string
		.trim();
};

/**
 * Extracts the file extension from a given file name.
 * @param {string} fileName
 * @returns {string | undefined}
 */
export const getFileExtension = (fileName: string): string | undefined => {
	return fileName.split('.').pop()?.toLowerCase();
};

export const getSizeInBytes = (size: string | number): number => {
	// Parse the string value into an integer in bytes.
	// If value is a number it is assumed is in bytes.
	return bytes.parse(size) || 0;
};

/**
 * Determines the separator character for a given file based on its extension.
 * @param fileName The name of the file whose extension determines the separator character.
 * @returns The separator character associated with the file extension, or `undefined` if
 *          the file extension is invalid or unrecognized.
 */
export const getSeparatorCharacter = (fileName: string) => {
	const fileExtension = getValidFileExtension(fileName);
	if (fileExtension) {
		return columnSeparatorValue[fileExtension];
	}
	return;
};

/**
 * Extracts and validates the file extension from the filename.
 * @param {string} fileName
 * @returns {SupportedFileExtensions | undefined}
 */
export const getValidFileExtension = (fileName: string): SupportedFileExtensions | undefined => {
	const extension = getFileExtension(fileName);
	return extension ? validateFileExtension(extension) : undefined;
};

/**
 * Maps a record array to an object with keys from headers, formatting each value for compatibility.
 * @param headers An array of header names, used as keys for the returned object.
 * @param record An array of values corresponding to each header, to be formatted and mapped.
 * @returns An `UnprocessedDataRecord` object where each header in `headers` is a key,
 *          and each value is the corresponding entry in `record` formatted for compatibility.
 */
export const mapRecordToHeaders = (headers: string[], record: string[]) => {
	return headers.reduce((obj: UnprocessedDataRecord, nextKey, index) => {
		const dataStr = record[index] || '';
		const formattedData = formatForExcelCompatibility(dataStr);
		obj[nextKey] = formattedData;
		return obj;
	}, {});
};

/**
 * Read a file and parse field names based on schema definition
 * Supported files: .tsv or .csv
 * @param {Express.Multer.File} file A file to read
 * @param {Schema} schema Schema to parse field names
 * @returns an array of records where each record is a key-value pair object representing
 * a row in the file.
 */
export const parseFileToRecords = async (
	file: Express.Multer.File,
	schema: Schema,
): Promise<Record<string, string>[]> => {
	const returnRecords: Record<string, string>[] = [];
	const separatorCharacter = getSeparatorCharacter(file.originalname);
	if (!separatorCharacter) {
		throw new Error('Invalid file Extension');
	}

	let headers: string[] = [];

	const schemaDisplayNames = schema.fields.reduce<Record<string, string>>((acc, field) => {
		acc[field.meta?.displayName?.toString() || field.name] = field.name;
		return acc;
	}, {});

	return new Promise((resolve) => {
		const stream = fs.createReadStream(file.path).pipe(csvParse({ delimiter: separatorCharacter }));

		stream.on('data', (record: string[]) => {
			if (!headers.length) {
				headers = record
					.map((value) => schemaDisplayNames[value] ?? value)
					.filter((value) => value)
					.map((str) => str.trim());
			} else {
				const mappedRecord = mapRecordToHeaders(headers, record);

				returnRecords.push(mappedRecord);
			}
		});

		stream.on('end', () => {
			resolve(returnRecords);
		});

		stream.on('close', () => {
			stream.destroy();
			fs.unlink(file.path, () => {});
		});
	});
};

/**
 * Pre-validates a data file before submission.
 *
 * This function performs a series of checks on the provided file to ensure it meets the necessary criteria before it can be submitted for data processing.
 * The following checks are performed:
 * - Verifies that the file has a supported extension and format.
 * - Verifies that the file contains the required column names as per the provided schema.
 * - Verifies if the file is for editing data, it must contain the systemId column
 *
 * If any of these checks fail, an error is returned
 * @param file The file to be validated
 * @param schema The schema against which the file will be validated
 * @returns
 */
export const prevalidateDataFile = async (
	file: Express.Multer.File,
	schema: Schema,
	isEditFile: boolean = false,
): Promise<{ error?: BatchError }> => {
	// check if extension is supported
	const separatorCharacter = getSeparatorCharacter(file.originalname);
	if (!separatorCharacter) {
		const message = `Invalid file extension ${file.originalname.split('.')[1]}`;
		return {
			error: {
				type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
				message,
				batchName: file.originalname,
			},
		};
	}

	const firstLine = await readHeaders(file);
	const fileHeaders = firstLine.split(separatorCharacter).map((str) => str.trim());

	if (isEditFile && !fileHeaders.includes(systemIdColumn)) {
		const message = `File is missing the column '${systemIdColumn}'`;
		return {
			error: {
				type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
				message,
				batchName: file.originalname,
			},
		};
	}

	const missingRequiredFields = schema.fields
		.filter((field) => field.restrictions && 'required' in field.restrictions) // filter required fields
		.map((field) => field.meta?.displayName?.toString() || field.name) // map displayName if exists
		.filter((fieldName) => !fileHeaders.includes(fieldName));
	if (missingRequiredFields.length > 0) {
		const message = `Missing required fields '${JSON.stringify(missingRequiredFields)}'`;
		return {
			error: {
				type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
				message,
				batchName: file.originalname,
			},
		};
	}
	return {};
};

/**
 * Reads only first line of the file
 * Usefull when file is too large and we're only interested in column names
 * @param file A file we want to read
 * @returns a string with the content of the first line of the file
 */
export const readHeaders = async (file: Express.Multer.File) => {
	return firstline(file.path);
};

/**
 * Validates if the file extension is supported.
 * @param {string} extension
 * @returns {SupportedFileExtensions | undefined}
 */
export const validateFileExtension = (extension: string): SupportedFileExtensions | undefined => {
	try {
		return SUPPORTED_FILE_EXTENSIONS.parse(extension);
	} catch {
		return;
	}
};
