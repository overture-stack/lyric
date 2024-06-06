import * as lodash from 'lodash-es';

export const isEmptyString = (value: any) => {
	return value == null || (typeof value === 'string' && value.trim().length === 0);
};

export const isArrayWithValues = (value: any) => {
	return Array.isArray(value) && value.length > 0;
};

export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
	// lodash 4.14 behavior note, these are all evaluated to true:
	// _.isEmpty(null) _.isEmpty(undefined) _.isEmpty([])
	// _.isEmpty({}) _.isEmpty('') _.isEmpty(12) & _.isEmpty(NaN)

	// so check number seperately since it will evaluate to isEmpty=true
	return (isNumber(value) && !isNaN(value)) || !lodash.isEmpty(value);
}

export function isNumber(value: any): value is number {
	return typeof value === 'number';
}

/**
 * Function that returns true if input is a valid number greater than zero.
 * Otherwise it returns false
 * @param {any} value
 * @returns {boolean}
 */
export function isValidIdNumber(value: any): boolean {
	return isNumber(value) && !isNaN(value) && value > 0;
}
