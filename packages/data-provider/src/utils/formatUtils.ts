import * as lodash from 'lodash-es';

export const isEmptyString = (value: unknown) => {
	return value == null || (typeof value === 'string' && value.trim().length === 0);
};

export const isArrayWithValues = (value: unknown) => {
	return Array.isArray(value) && value.length > 0 && value.some((x) => !!x);
};

export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
	// lodash 4.14 behavior note, these are all evaluated to true:
	// _.isEmpty(null) _.isEmpty(undefined) _.isEmpty([])
	// _.isEmpty({}) _.isEmpty('') _.isEmpty(12) & _.isEmpty(NaN)

	// so check number seperately since it will evaluate to isEmpty=true
	return (isNumber(value) && !isNaN(value)) || !lodash.isEmpty(value);
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number';
}

export function uniqueCharacters(value: string): string {
	if (isEmptyString(value)) {
		return '';
	}
	// Split the string to make array
	const splitted = value.replace(/\s/g, '').split('');

	// Create a new array using set
	const arrayCharacters = [...new Set(splitted)];

	// join array to make it string
	return arrayCharacters.join('');
}

/**
 * Function that returns true if input is a valid number greater than zero.
 * Otherwise it returns false
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIdNumber(value: unknown): boolean {
	return isNumber(value) && !isNaN(value) && value > 0 && value < Number.MAX_VALUE;
}

/**
 * Checks if a given string is a valid date format.
 *
 * This function attempts to parse the input string into a timestamp.
 * If the parsing is successful and the result is a valid date, it returns `true`.
 * Otherwise, it returns `false`.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidDateFormat(value: string): boolean {
	const timestamp = Date.parse(value);

	return !isNaN(timestamp);
}

/**
 * Ensure a value is wrapped in an array.
 *
 * If passed an array, return it returns the same array. If passed a single item, wrap it in an array.
 * The function then filters out any empty strings and `undefined` values
 * @param val an item or array
 * @return an array
 */
export const asArray = <T>(val: T | T[]): T[] => {
	const result = Array.isArray(val) ? val : [val];
	return result.filter((item) => item !== null && item !== '' && item !== undefined);
};

/**
 * Performs a deep comparison between two values to determine if they are deeply equal.
 * @param obj1 The first value to compare.
 * @param obj2 The second value to compare.
 * @returns
 */
export const deepCompare = (obj1: unknown, obj2: unknown): boolean => {
	// Handle primitives and reference equality
	if (obj1 === obj2) {
		return true;
	}

	if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
		return false; // Ensure both are non-null objects
	}

	// Ensure obj1 and obj2 are both records (i.e., objects)
	if (!isObject(obj1) || !isObject(obj2)) {
		return false;
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);

	// Different number of keys
	if (keys1.length !== keys2.length) {
		return false;
	}

	for (const key of keys1) {
		const val1 = obj1[key];
		const val2 = obj2[key];

		if (!keys2.includes(key) || !deepCompare(val1, val2)) {
			return false;
		}
	}

	return true;
};

// Helper function to check if an object is a plain object
function isObject(obj: unknown): obj is Record<string, unknown> {
	return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

export const convertRecordToString = (record: Record<string, unknown>): Record<string, string> => {
	const convertedRecord: Record<string, string> = {};

	for (const [key, value] of Object.entries(record)) {
		convertedRecord[key] = String(value);
	}

	return convertedRecord;
};

/**
 * Returns a portion of the provided array based on the given page and page size
 */
export const paginateItems = <T>(items: Array<T>, page: number, pageSize: number): Array<T> => {
	const startIndex = (page - 1) * pageSize;
	return items.slice(startIndex, startIndex + pageSize);
};
