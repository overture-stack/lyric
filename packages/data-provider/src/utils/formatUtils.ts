import * as lodash from 'lodash-es';

import { VIEW_TYPE } from './types.js';

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

/**
 * Checks if the provided value is a valid view type.
 * It returns `true` if the validation is successful otherwise `false`
 * @param {string} value
 * @returns boolean
 */
export const isValidView = (value: string): boolean =>
	typeof value === 'string' && VIEW_TYPE.safeParse(value.toLowerCase()).success;

export function isNumber(value: unknown): value is number {
	return typeof value === 'number';
}

export function uniqueCharacters(value: string): string {
	if (isEmptyString(value)) return '';
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
	if (obj1 === obj2) return true; // Handle primitives and reference equality

	if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
		return false; // Ensure both are non-null objects
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);

	if (keys1.length !== keys2.length) return false; // Different number of keys

	for (const key of keys1) {
		const val1 = (obj1 as Record<string, unknown>)[key];
		const val2 = (obj2 as Record<string, unknown>)[key];

		if (!keys2.includes(key) || !deepCompare(val1, val2)) {
			return false;
		}
	}

	return true;
};
