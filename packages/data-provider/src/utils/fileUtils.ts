import bytes from 'bytes';
import firstline from 'firstline';
import fs from 'fs';

import {
	type DataRecord,
	parse,
	type ParseSchemaError,
	type Schema,
	type UnprocessedDataRecord,
} from '@overture-stack/lectern-client';

import { notEmpty } from './formatUtils.js';
import {
	BATCH_ERROR_TYPE,
	type BatchError,
	columnSeparatorValue,
	SUPPORTED_FILE_EXTENSIONS,
	type SupportedFileExtensions,
} from './types.js';

const fsPromises = fs.promises;

/**
 * Extracts the extension from the filename and returns it if it's supported.
 * Otherwise it returns undefined.
 * @param {string} fileName
 * @returns {SupportedFileExtensions | undefined}
 */
export const extractFileExtension = (fileName: string): SupportedFileExtensions | undefined => {
	// Extract the file extension
	const fileExtension = fileName.split('.').pop()?.toLowerCase();

	try {
		// Parse to validate the extension against the Zod enum
		return SUPPORTED_FILE_EXTENSIONS.parse(fileExtension);
	} catch (error) {
		return;
	}
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
 * Reads a text file and parse it to a JSON format.
 * Supported files: .tsv and .csv
 * @param {string} fileName Full filename path of the file
 * @param {Schema} schema Schema to parse data with
 * @returns a JSON format objet
 */
export const textToJson = async (
	fileName: string,
	schema: Schema,
): Promise<{ records: DataRecord[]; errors?: ParseSchemaError[] }> => {
	const fileExtension = extractFileExtension(fileName);
	if (!fileExtension) {
		throw new Error('Invalid file Extension');
	}
	const contents = await fsPromises.readFile(fileName, 'utf-8');
	const separator = columnSeparatorValue[fileExtension];
	const arr = parseTextToJson(contents, separator);
	const parseSchemaResult = parse.parseSchemaValues(arr, schema);
	if (parseSchemaResult.success) {
		return { records: parseSchemaResult.data.records };
	}
	return {
		records: parseSchemaResult.data.records,
		errors: parseSchemaResult.data.errors,
	};
};

const parseTextToJson = (content: string, separator: string): UnprocessedDataRecord[] => {
	const lines = content.split('\n');
	const headers = lines.slice(0, 1)[0].trim().split(separator);
	const rows = lines
		.slice(1, lines.length)
		.filter((line) => line && line.trim() !== '')
		.map((line) => {
			const data = line.split(separator);
			return headers.reduce((obj: UnprocessedDataRecord, nextKey, index) => {
				const dataStr = data[index] || '';
				const formattedData = formatForExcelCompatibility(dataStr);
				obj[nextKey] = formattedData;
				return obj;
			}, {});
		});
	return rows.filter(notEmpty);
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
	return bytes.parse(size);
}

type FileProcessingResult = {
	validFiles: Express.Multer.File[];
	fileErrors: BatchError[];
};

/**
 * Processes an array of uploaded files, filtering valid `.tsv` files and checking for required headers
 *
 * @param {Express.Multer.File[]} files An array of `Express.Multer.File` objects representing the uploaded files.
 * @returns A `Promise<FileProcessingResult>` that resolves to an object containing two arrays:
 * - `validFiles`: Files that have a `.tsv` extension and contain the `systemId` header.
 * - `fileErrors`: Files that either have an invalid extension or are missing the required `systemId` header.
 */
export async function processFiles(files: Express.Multer.File[]): Promise<FileProcessingResult> {
	const result: FileProcessingResult = {
		validFiles: [],
		fileErrors: [],
	};

	for (const file of files) {
		try {
			if (extractFileExtension(file.originalname)) {
				const fileHeaders = await readHeaders(file); // Wait for the async operation
				if (fileHeaders.includes('systemId')) {
					result.validFiles.push(file);
				} else {
					const batchError: BatchError = {
						type: BATCH_ERROR_TYPE.MISSING_REQUIRED_HEADER,
						message: `File '${file.originalname}' is missing the column 'systemId'`,
						batchName: file.originalname,
					};
					result.fileErrors.push(batchError);
				}
			} else {
				const batchError: BatchError = {
					type: BATCH_ERROR_TYPE.INVALID_FILE_EXTENSION,
					message: `File '${file.originalname}' has invalid file extension. File extension must be '${SUPPORTED_FILE_EXTENSIONS}'`,
					batchName: file.originalname,
				};
				result.fileErrors.push(batchError);
			}
		} catch (error) {
			const batchError: BatchError = {
				type: BATCH_ERROR_TYPE.FILE_READ_ERROR,
				message: `Error reading file '${file.originalname}'`,
				batchName: file.originalname,
			};
			result.fileErrors.push(batchError);
		}
	}

	return result;
}
