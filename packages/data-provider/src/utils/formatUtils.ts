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
