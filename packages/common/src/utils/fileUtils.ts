import firstline from 'firstline';
import fs from 'fs';
import { BadRequest } from './errors.js';
import { notEmpty } from './formatUtils.js';

const fsPromises = fs.promises;

export type TsvRecordAsJsonObj = { [header: string]: string | string[] };

export const ARRAY_DELIMITER_CHAR = '|';

/**
 * Validates if a file contains a .tsv extension
 * @param file A file to check its extension
 * throws a BadRequest errot type when file is not a .tsv
 */
export const validateTsvExtension = (file: Express.Multer.File): void => {
	// check if has .tsv extension to prevent irregular file names from reaching service level
	if (!file.originalname.match(/.*\.tsv$/)) {
		throw new BadRequest('Invalid extension');
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
 * Reads a .tsv file and parse it to a JSON format
 * @param {string} fileName
 * @returns a JSON format objet
 */
export const tsvToJson = async (fileName: string): Promise<ReadonlyArray<TsvRecordAsJsonObj>> => {
	const contents = await fsPromises.readFile(fileName, 'utf-8');
	const arr = parseTsvToJson(contents);
	return arr;
};

const parseTsvToJson = (content: string): ReadonlyArray<TsvRecordAsJsonObj> => {
	const lines = content.split('\n');
	const headers = lines.slice(0, 1)[0].trim().split('\t');
	const rows = lines.slice(1, lines.length).map((line) => {
		// check for any empty lines
		if (!line || line.trim() === '') {
			return undefined;
		}
		const data = line.split('\t');
		return headers.reduce<TsvRecordAsJsonObj>((obj, nextKey, index) => {
			const dataStr = data[index] || '';
			const formattedData = formatForExcelCompatibility(dataStr);
			const dataAsArray: string[] = formattedData
				.trim()
				.split(ARRAY_DELIMITER_CHAR)
				.map((s) => s.trim());

			obj[nextKey] = dataAsArray.length === 1 ? dataAsArray[0] : dataAsArray;
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
