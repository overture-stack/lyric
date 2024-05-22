import SQONBuilder, {
	ArrayFilterValue,
	CombinationKeys,
	CombinationOperator,
	FilterOperator,
	GreaterThanFilter,
	LesserThanFilter,
	Operator,
	isArrayFilter,
	isCombination,
	isFilter,
} from '@overture-stack/sqon-builder';
import { SQL, and, not, or, sql } from 'drizzle-orm';
import * as _ from 'lodash-es';
import { ZodError } from 'zod';
import { BadRequest } from './errors.js';

// Column name on the database used to build JSONB query
const jsonbColumnName = 'data';

const isGreaterThanFilter = (operator: Operator): operator is GreaterThanFilter =>
	GreaterThanFilter.safeParse(operator).success;

const isLesserThanFilter = (operator: Operator): operator is LesserThanFilter =>
	LesserThanFilter.safeParse(operator).success;

// Map the array and format each element based on its type
const formatForSQL = (value: ArrayFilterValue) => {
	if (Array.isArray(value)) {
		// Handle array of strings or numbers
		return value
			.map((element) => {
				if (typeof element === 'string') {
					return `'${element}'`; // Surround strings with single quotes
				} else if (typeof element === 'number') {
					return element.toString(); // Numbers don't need quotes
				} else {
					throw new BadRequest(`Invalid SQON format. Unsupported data type: ${typeof element}`);
				}
			})
			.join(', ');
	} else if (typeof value === 'string') {
		// Handle single string
		return value;
	} else if (typeof value === 'number') {
		// Handle single number
		return value;
	}

	throw new BadRequest(`Invalid SQON. Unsupported data type: ${typeof value}`);
};

const processFilterOperator = (operator: FilterOperator): SQL<unknown> => {
	const { fieldName, value } = operator.content;

	if (isArrayFilter(operator)) {
		// op is in
		return sql.raw(`${jsonbColumnName} ->> '${formatForSQL(fieldName)}' IN (${formatForSQL(value)})`);
	} else if (isGreaterThanFilter(operator)) {
		// is an scalar filter op is gt
		return sql.raw(`${jsonbColumnName} ->> '${formatForSQL(fieldName)}' > '${formatForSQL(value)}'`);
	} else if (isLesserThanFilter(operator)) {
		// is an scalar filter op is lt
		return sql.raw(`${jsonbColumnName} ->> '${formatForSQL(fieldName)}' < '${formatForSQL(value)}'`);
	}

	throw new BadRequest(`Invalid SQON format. Unsupported SQON filter operator`);
};

const iterateOperator = (operator: Operator): SQL<unknown> => {
	if (isFilter(operator)) {
		// op in [in, lt, gt]
		return processFilterOperator(operator);
	} else if (isCombination(operator)) {
		// op in [and, or, not]
		return processCombinationOperator(operator);
	}

	throw new BadRequest(`Invalid SQON format. Unsupported SQON Operator`);
};

const iterateOperators = (operators: Operator[]) => {
	return operators.map((operator) => iterateOperator(operator));
};

const processCombinationOperator = (sqon: CombinationOperator): SQL<unknown> => {
	switch (sqon.op) {
		case CombinationKeys.And:
			return andOperator(sqon.content);
		case CombinationKeys.Or:
			return orOperator(sqon.content);
		case CombinationKeys.Not:
			return notOperator(sqon.content);
	}
};

const andOperator = (operations: Operator[]): SQL<unknown> => {
	const andSql = and(...iterateOperators(operations));
	if (!andSql) {
		throw new BadRequest(`Invalid SQON format. Invalid 'and' operator`);
	}

	return andSql;
};

const orOperator = (operations: Operator[]): SQL<unknown> => {
	const orSql = or(...iterateOperators(operations));
	if (!orSql) {
		throw new BadRequest(`Invalid SQON format. Invalid 'or' operator`);
	}

	return orSql;
};

const notOperator = (operations: Operator[]): SQL<unknown> => {
	return not(iterateOperator(operations[0]));
};

/**
 * Main function to converts any SQON object to a partial SQL to query a JSONB column
 * The result query uses the operator ->> to get a JSON object field as text
 *
 * @example
 * Input:
 *  { "op": "in", "content": { "fieldName": "country", "value": [ "Canada" ] } }
 * Output:
 *  metadata ->> 'country' IN ('Canada')
 *
 * @param {Operator | undefined} sqon SQON input
 * @returns {SQL<unknown>}
 */
export const convertSqonToQuery = (sqon: Operator | undefined): SQL<unknown> | undefined => {
	if (!sqon || _.isEmpty(sqon)) {
		return undefined;
	}

	return iterateOperator(sqon);
};

/**
 * Given any input, attempt to parse it as a SQON.
 * An error will be thrown if the provided input is invalid.
 * @param {unknown} input
 * @returns SQONBuilder
 */
export const parseSQON = (input: unknown) => {
	try {
		// Given any input, attempt to parse it as a SQON.
		// An error will be thrown if the provided input is invalid.
		return SQONBuilder.default.from(input);

		// TODO: SQL sanitization (https://github.com/overture-stack/lyric/issues/43)
	} catch (error: unknown) {
		if (isZodError(error)) {
			throw new BadRequest('Invalid SQON format', (error as ZodError).issues);
		}
	}
};

const isZodError = (error: unknown) => {
	return error && typeof error === 'object' && 'name' in error && error.name === 'ZodError';
};
