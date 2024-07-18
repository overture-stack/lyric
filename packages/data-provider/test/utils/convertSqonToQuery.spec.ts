import { expect } from 'chai';
import { SQL, SQLChunk } from 'drizzle-orm';
import { describe, it } from 'mocha';

import { SQON } from '@overture-stack/sqon-builder';

import { convertSqonToQuery, parseSQON } from '../../src/utils/convertSqonToQuery.js';

function extractValues(obj: SQL | undefined, key: string) {
	let values: SQL[] = [];

	function recurse(currentObj: SQL | undefined) {
		if (Array.isArray(currentObj)) {
			currentObj.forEach(recurse);
		} else if (currentObj && typeof currentObj === 'object') {
			if (Object.prototype.hasOwnProperty.call(currentObj, key)) {
				values = values.concat(currentObj[key]);
			}
			Object.values(currentObj).forEach(recurse);
		}
	}

	recurse(obj);
	return values;
}

describe('Test SQON functions', () => {
	describe('Test SQON with greater than filter', () => {
		const sqonGreaterThanFilterRawInput = {
			op: 'and',
			content: [
				{
					op: 'gt',
					content: {
						fieldName: 'date_of_birth',
						value: 197005,
					},
				},
			],
		};

		const sqonGreaterThanFilterParsed: SQON = {
			op: 'gt',
			content: { fieldName: 'date_of_birth', value: 197005 },
		};

		const greaterThanFilterChunk: SQLChunk[] = ["data ->> 'date_of_birth' > '197005'"];

		it('should convert a json text with greater than filter into a SQON format', () => {
			const result = parseSQON(sqonGreaterThanFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonGreaterThanFilterParsed));
		});

		it('should convert SQON with greater than filter into a database query', () => {
			const result = convertSqonToQuery(sqonGreaterThanFilterParsed);
			const extractedValues = extractValues(result, 'value');
			expect(extractedValues).to.eql(greaterThanFilterChunk);
		});
	});

	describe('Test SQON with less than filter', () => {
		const sqonLessThanFilterRawInput = {
			op: 'and',
			content: [
				{
					op: 'lt',
					content: {
						fieldName: 'date_of_birth',
						value: 197005,
					},
				},
			],
		};

		const sqonLessThanFilterParsed: SQON = {
			op: 'lt',
			content: { fieldName: 'date_of_birth', value: 197005 },
		};

		const lessThanFilterChunk: SQLChunk[] = ["data ->> 'date_of_birth' < '197005'"];

		it('should convert a json text with less than filter into a SQON format', () => {
			const result = parseSQON(sqonLessThanFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonLessThanFilterParsed));
		});

		it('should convert SQON with less than filter into a database query', () => {
			const result = convertSqonToQuery(sqonLessThanFilterParsed);
			const extractedValues = extractValues(result, 'value');
			expect(extractedValues).to.eql(lessThanFilterChunk);
		});
	});

	describe('Test SQON with NOT filter', () => {
		const sqonCombinedNOTFilterRawInput = {
			op: 'not',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'submitter_participant_id',
						value: ['NR-01'],
					},
				},
			],
		};

		const sqonCombinedNOTFilterParsed: SQON = {
			op: 'not',
			content: [{ op: 'in', content: { fieldName: 'submitter_participant_id', value: ['NR-01'] } }],
		};

		const combinedNOTFilterChunks: SQLChunk[] = ['not ', "data ->> 'submitter_participant_id' IN ('NR-01')", ''];

		it('should convert a json text with NOT filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedNOTFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedNOTFilterParsed));
		});

		it('should convert SQON with NOT filter into a database query', () => {
			const result = convertSqonToQuery(sqonCombinedNOTFilterParsed);
			const extractedValues = extractValues(result, 'value');
			expect(extractedValues).to.eql(combinedNOTFilterChunks);
		});
	});

	describe('Test SQON with a combination of AND filter', () => {
		const sqonCombinedANDFilterRawInput = {
			op: 'and',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'submitter_participant_id',
						value: ['NR-01'],
					},
				},
				{
					op: 'in',
					content: {
						fieldName: 'study_id',
						value: ['XYZ'],
					},
				},
			],
		};

		const sqonCombinedANDFilterParsed: SQON = {
			op: 'and',
			content: [
				{ op: 'in', content: { fieldName: 'submitter_participant_id', value: ['NR-01'] } },
				{ op: 'in', content: { fieldName: 'study_id', value: ['XYZ'] } },
			],
		};

		const combinedANDFilterChunks: SQLChunk[] = [
			'(',
			"data ->> 'submitter_participant_id' IN ('NR-01')",
			' and ',
			"data ->> 'study_id' IN ('XYZ')",
			')',
		];

		it('should convert a json text with AND filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedANDFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedANDFilterParsed));
		});

		it('should convert SQON with AND filter into a database query', () => {
			const result = convertSqonToQuery(sqonCombinedANDFilterParsed);
			const extractedValues = extractValues(result, 'value');
			expect(extractedValues).to.eql(combinedANDFilterChunks);
		});
	});

	describe('Test SQON with a combination of OR filter', () => {
		const sqonCombinedORFilterRawInput = {
			op: 'or',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'submitter_participant_id',
						value: ['NR-01'],
					},
				},
				{
					op: 'in',
					content: {
						fieldName: 'study_id',
						value: ['XYZ'],
					},
				},
			],
		};

		const sqonCombinedORFilterParsed: SQON = {
			op: 'or',
			content: [
				{ op: 'in', content: { fieldName: 'submitter_participant_id', value: ['NR-01'] } },
				{ op: 'in', content: { fieldName: 'study_id', value: ['XYZ'] } },
			],
		};

		const combinedORFilterChunks: SQLChunk[] = [
			'(',
			"data ->> 'submitter_participant_id' IN ('NR-01')",
			' or ',
			"data ->> 'study_id' IN ('XYZ')",
			')',
		];

		it('should convert a json text with OR filter into a SQON format', () => {
			const result = parseSQON(sqonCombinedORFilterRawInput);
			expect(JSON.stringify(result)).to.eql(JSON.stringify(sqonCombinedORFilterParsed));
		});

		it('should convert SQON with OR filter into a database query', () => {
			const result = convertSqonToQuery(sqonCombinedORFilterParsed);
			const extractedValues = extractValues(result, 'value');
			expect(extractedValues).to.eql(combinedORFilterChunks);
		});
	});

	describe('Test invalid SQON filter operator', () => {
		const sqonInvalidFilterRawInput = {
			op: 'xor',
			content: [
				{
					op: 'in',
					content: {
						fieldName: 'submitter_participant_id',
						value: ['NR-01'],
					},
				},
			],
		};

		it('should return a BadRequest error invalid SQON format', () => {
			expect(parseSQON.bind(sqonInvalidFilterRawInput)).to.throw('Invalid SQON format');
		});
	});
});
