import bytes from 'bytes';
import firstline from 'firstline';
import fs from 'fs';

import { DataRecord, SchemaData } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { notEmpty } from './formatUtils.js';
import { BATCH_ERROR_TYPE, type BatchError } from './types.js';

const fsPromises = fs.promises;

export const ARRAY_DELIMITER_CHAR = '|';

/**
 * Returns true if a file name contains a .tsv extension
 * @param {Express.Multer.File} file
 * @returns {boolean}
 */
export const hasTsvExtension = (file: Express.Multer.File): boolean => !!file.originalname.match(/.*\.tsv$/);

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
 * Reads a .tsv file and parse it to a JSON format
 * @param {string} fileName
 * @returns a JSON format objet
 */
export const tsvToJson = async (fileName: string): Promise<SchemaData> => {
	const contents = await fsPromises.readFile(fileName, 'utf-8');
	const arr = parseTsvToJson(contents);
	return arr;
};

const parseTsvToJson = (content: string): SchemaData => {
	const lines = content.split('\n');
	const headers = lines.slice(0, 1)[0].trim().split('\t');
	const rows = lines
		.slice(1, lines.length)
		.filter((line) => line && line.trim() !== '')
		.map((line) => {
			const data = line.split('\t');
			return headers.reduce((obj: { [k: string]: string | string[] }, nextKey, index) => {
				const dataStr = data[index] || '';
				const formattedData = formatForExcelCompatibility(dataStr);
				const dataAsArray: string[] = formattedData
					.trim()
					.split(ARRAY_DELIMITER_CHAR)
					.map((s) => s.trim());

				obj[nextKey] = dataAsArray.length === 1 ? dataAsArray[0] : dataAsArray;
				return obj as DataRecord;
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
		if (hasTsvExtension(file)) {
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
				message: `File '${file.originalname}' has invalid file extension. File extension must be '.tsv'`,
				batchName: file.originalname,
			};
			result.fileErrors.push(batchError);
		}
	}

	return result;
}
