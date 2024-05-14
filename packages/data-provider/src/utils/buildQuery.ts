import { SQL, and, not, or, sql } from 'drizzle-orm';
import * as _ from 'lodash-es';
import { BadRequest } from './errors.js';
import {
	ArrayFilterValue,
	CombinationKeys,
	CombinationOperator,
	FilterOperator,
	Operator,
	isArrayFilter,
	isCombination,
	isFilter,
	isGreaterThanFilter,
	isLesserThanFilter,
} from './sqonTypes.js';

const jsonbColumnName = 'data';

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
	} else {
		throw new BadRequest(`Invalid SQON. Unsupported data type: ${typeof value}`);
	}
};

const processFilterOperator = (operator: FilterOperator): SQL<unknown> => {
	const { fieldName, value } = operator.content;
	if (isArrayFilter(operator)) {
		// op is in
		return sql.raw(`${jsonbColumnName} ->> '${formatForSQL(fieldName)}' IN (${formatForSQL(value)})`);
	}

	// is an scalar filter op is lt or gt
	if (isGreaterThanFilter(operator)) {
		return sql.raw(`${jsonbColumnName} ->> '${formatForSQL(fieldName)}' > '${formatForSQL(value)}'`);
	} else if (isLesserThanFilter(operator)) {
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
	if (sqon.op === CombinationKeys.And) {
		return andOperator(sqon.content);
	} else if (sqon.op === CombinationKeys.Or) {
		return orOperator(sqon.content);
	} else if (sqon.op === CombinationKeys.Not) {
		return notOperator(sqon.content);
	}
	throw new BadRequest(`Invalid SQON format. Unsupported SQON combination operator: ${sqon}`);
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

export const convertSqonToQuery = (sqon: Operator | undefined): SQL<unknown> | undefined => {
	if (!sqon || _.isEmpty(sqon)) {
		return undefined;
	}
	if (isCombination(sqon)) {
		// top level SQON must have op in [and, or, not]
		return processCombinationOperator(sqon);
	}
	throw new BadRequest('Invalid SQON format. Top level SQON must be a combination operator (and, or, not');
};
