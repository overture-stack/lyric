import bytes, { type Unit } from 'bytes';
import { parse as csvParse } from 'csv-parse';
import firstline from 'firstline';
import fs from 'fs';

import {
	type DataRecord,
	parse,
	type ParseSchemaError,
	type Schema,
	type UnprocessedDataRecord,
} from '@overture-stack/lectern-client';

import {
	BATCH_ERROR_TYPE,
	type BatchError,
	columnSeparatorValue,
	SUPPORTED_FILE_EXTENSIONS,
	type SupportedFileExtensions,
} from './types.js';

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
 * Determines the separator character for a given file based on its extension.
 * @param fileName The name of the file whose extension determines the separator character.
 * @returns The separator character associated with the file extension, or `undefined` if
 *          the file extension is invalid or unrecognized.
 */
export const getSeparatorCharacter = (fileName: string): string | undefined => {
	const fileExtension = extractFileExtension(fileName);
	if (fileExtension) {
		return columnSeparatorValue[fileExtension];
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
export const mapRecordToHeaders = (headers: string[], record: string[]) => {
	return headers.reduce((obj: UnprocessedDataRecord, nextKey, index) => {
		const dataStr = record[index] || '';
		const formattedData = formatForExcelCompatibility(dataStr);
		obj[nextKey] = formattedData;
		return obj;
	}, {});
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
 * Records are parsed to match schema field types.
 * Supported files: .tsv and .csv
 * @param {Express.Multer.File} file A file to read
 * @param {Schema} schema Schema to parse data with
 * @returns a JSON format objet
 */
export const readTextFile = async (
	file: Express.Multer.File,
	schema: Schema,
): Promise<{ records: DataRecord[]; errors?: ParseSchemaError[] }> => {
	const returnRecords: DataRecord[] = [];
	const returnErrors: ParseSchemaError[] = [];
	const separatorCharacter = getSeparatorCharacter(file.originalname);
	if (!separatorCharacter) {
		throw new Error('Invalid file Extension');
	}

	let headers: string[] = [];
	let lineNumber = 0;

	return new Promise((resolve, reject) => {
		const stream = fs.createReadStream(file.path).pipe(csvParse({ delimiter: separatorCharacter }));

		stream.on('data', (record: string[]) => {
			lineNumber++;
			if (!headers.length) {
				// Replace display names with field names if exists
				headers = record.map(
					(header) => schema.fields.find((field) => field.meta?.displayName === header)?.name || header,
				);
			} else {
				const mappedRecord = mapRecordToHeaders(headers, record);

				try {
					const parseSchemaResult = parse.parseRecordValues(mappedRecord, schema);
					if (parseSchemaResult.success) {
						returnRecords.push(parseSchemaResult.data.record);
					} else {
						returnRecords.push(parseSchemaResult.data.record);
						returnErrors.push({
							recordErrors: parseSchemaResult.data.errors,
							recordIndex: lineNumber,
						});
					}

					if (lineNumber % 1000 === 0) {
						// TODO: Add batch processing logic here (e.g., write to database or process as needed)
						// returnRecords = []; // Clear the array after processing the batch
						// returnErrors = []; // Clear the array after processing the batch
					}
				} catch (error) {
					console.error(`Catching error parsing data: ${error}`);
				}
			}
		});

		stream.on('end', () => {
			resolve({ records: returnRecords, errors: returnErrors });
		});

		stream.on('close', () => {
			stream.destroy();
			fs.unlink(file.path, () => {});
		});

		stream.on('error', () => {
			reject({ records: returnRecords, errors: returnErrors });
		});
	});
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
 * @returns The file size formatted as a string in the specified unit with the given precision.
 *
 */
export const formatByteSize = (sizeInBytes: number, unit: Unit, precision: number) => {
	return bytes.format(sizeInBytes, { unit, decimalPlaces: precision });
};

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
					message: `File '${file.originalname}' has invalid file extension. File extension must be '${SUPPORTED_FILE_EXTENSIONS.options}'`,
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
