import { expect } from 'chai';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, it } from 'mocha';

import { SQON } from '@overture-stack/sqon-builder';

import { convertSqonToQuery, parseSQON } from '../../../src/utils/convertSqonToQuery.js';

const dialect = new PgDialect();

/**
 * Renders a SQON to its final query text with parameters inlined, for readable test assertions.
 * The production code path never inlines parameters; this is test-only.
 */
function toInlinedQuery(sqon: SQON | undefined): string {
	const result = convertSqonToQuery(sqon);
	if (!result) {
		return '';
	}
	const { sql, params } = dialect.sqlToQuery(result);
	return params.reduce((text: string, param) => text.replace(/\$\d+/, JSON.stringify(param)), sql);
}

describe('SQON utils', () => {
	describe('SQON with greater than filter', () => {
		const sqonGreaterThanFilterParsed: SQON = {
			op: 'gt',
			content: { fieldName: 'date_of_birth', value: 197005 },
		};

		it('should convert SQON with greater than filter into a database query', () => {
			const result = toInlinedQuery(sqonGreaterThanFilterParsed);
			expect(result).to.eql(`data ->> "date_of_birth" > "197005"`);
		});
	});

	describe('SQON with less than filter', () => {
		const sqonLessThanFilterParsed: SQON = {
			op: 'lt',
			content: { fieldName: 'date_of_birth', value: 197005 },
		};

		it('should convert SQON with less than filter into a database query', () => {
			const result = toInlinedQuery(sqonLessThanFilterParsed);
			expect(result).to.eql(`data ->> "date_of_birth" < "197005"`);
		});
	});

	describe('SQON with NOT filter', () => {
		const sqonCombinedNOTFilterRawInput = {
			op: 'not',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'player_id',
						value: ['NR-01'],
					},
				},
			],
		};

		const sqonCombinedNOTFilterParsed: SQON = {
			op: 'not',
			content: [{ op: 'in', content: { fieldName: 'player_id', value: ['NR-01'] } }],
		};

		it('should convert a json text with NOT filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedNOTFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedNOTFilterParsed));
		});

		it('should convert SQON with NOT filter into a database query', () => {
			const result = toInlinedQuery(sqonCombinedNOTFilterParsed);
			expect(result).to.eql(`not data ->> "player_id" IN ("NR-01")`);
		});
	});

	describe('SQON with a combination of AND filter', () => {
		const sqonCombinedANDFilterRawInput = {
			op: 'and',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'player_id',
						value: ['NR-01'],
					},
				},
				{
					op: 'in',
					content: {
						fieldName: 'team_id',
						value: ['XYZ'],
					},
				},
			],
		};

		const sqonCombinedANDFilterParsed: SQON = {
			op: 'and',
			content: [
				{ op: 'in', content: { fieldName: 'player_id', value: ['NR-01'] } },
				{ op: 'in', content: { fieldName: 'team_id', value: ['XYZ'] } },
			],
		};

		it('should convert a json text with AND filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedANDFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedANDFilterParsed));
		});

		it('should convert SQON with AND filter into a database query', () => {
			const result = toInlinedQuery(sqonCombinedANDFilterParsed);
			expect(result).to.eql(`(data ->> "player_id" IN ("NR-01") and data ->> "team_id" IN ("XYZ"))`);
		});
	});

	describe('SQON with a combination of OR filter', () => {
		const sqonCombinedORFilterRawInput = {
			op: 'or',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'player_id',
						value: ['NR-01'],
					},
				},
				{
					op: 'in',
					content: {
						fieldName: 'team_id',
						value: ['XYZ'],
					},
				},
			],
		};

		const sqonCombinedORFilterParsed: SQON = {
			op: 'or',
			content: [
				{ op: 'in', content: { fieldName: 'player_id', value: ['NR-01'] } },
				{ op: 'in', content: { fieldName: 'team_id', value: ['XYZ'] } },
			],
		};

		it('should convert a json text with OR filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedORFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedORFilterParsed));
		});

		it('should convert SQON with OR filter into a database query', () => {
			const result = toInlinedQuery(sqonCombinedORFilterParsed);
			expect(result).to.eql(`(data ->> "player_id" IN ("NR-01") or data ->> "team_id" IN ("XYZ"))`);
		});
	});

	describe('invalid SQON filter operator', () => {
		const sqonInvalidFilterRawInput = {
			op: 'xor',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'player_id',
						value: ['NR-01'],
					},
				},
			],
		};

		it('should return a BadRequest error invalid SQON format', () => {
			expect(parseSQON.bind(sqonInvalidFilterRawInput)).to.throw('Invalid SQON format');
		});
	});

	describe('SQON filter values containing SQL metacharacters', () => {
		// Regression coverage for a SQL injection: fieldName and value are user input and must
		// always be bound as query parameters, never spliced into the generated SQL text.
		const sqonWithInjectionAttempt: SQON = {
			op: 'in',
			content: { fieldName: `x' OR '1'='1`, value: ['a'] },
		};

		it('binds a fieldName containing a quote as a parameter rather than breaking out of the query', () => {
			const result = convertSqonToQuery(sqonWithInjectionAttempt);
			const { sql, params } = dialect.sqlToQuery(result!);

			expect(sql).to.eql(`data ->> $1 IN ($2)`);
			expect(params).to.eql([`x' OR '1'='1`, 'a']);
		});

		it('renders the malicious fieldName as inert literal text, not as SQL syntax', () => {
			const result = toInlinedQuery(sqonWithInjectionAttempt);
			expect(result).to.eql(`data ->> "x' OR '1'='1" IN ("a")`);
		});
	});
});
