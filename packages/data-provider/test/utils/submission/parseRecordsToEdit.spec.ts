import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { DataRecord } from '@overture-stack/lectern-client';

import { parseRecordsToEdit } from '../../../src/utils/recordsParser.js';
import type { EntityData, SchemasDictionary } from '../../../src/utils/types.js';

describe('parseRecordsToEdit', () => {
	const inventoryDictionary: SchemasDictionary = {
		name: 'inventory',
		version: '1.0.0',
		schemas: [
			{
				name: 'user',
				fields: [
					{ name: 'id', valueType: 'number' },
					{ name: 'name', valueType: 'string' },
					{ name: 'birthYear', valueType: 'integer' },
					{ name: 'hasAllergies', valueType: 'boolean' },
				],
			},
			{
				name: 'product',
				fields: [
					{ name: 'id', valueType: 'number' },
					{ name: 'name', valueType: 'string' },
				],
			},
		],
	};
	it('should build records to update on submission` correctly for valid input', () => {
		const records: EntityData = {
			user: [
				{ id: '1', name: 'Alice', birthYear: '2000', hasAllergies: 'false' },
				{ id: '2', name: 'Pedro', birthYear: '1990', hasAllergies: 'true' },
			],
			product: [
				{ id: '101', name: 'Laptop' },
				{ id: '102', name: 'Monitor' },
			],
		};

		const result = parseRecordsToEdit(records, inventoryDictionary);

		// Fields properly formatted with the corresponding data type based on Dictionary
		const expectedResult: Record<string, DataRecord[]> = {
			user: [
				{ id: 1, name: 'Alice', birthYear: 2000, hasAllergies: false },
				{ id: 2, name: 'Pedro', birthYear: 1990, hasAllergies: true },
			],
			product: [
				{ id: 101, name: 'Laptop' },
				{ id: 102, name: 'Monitor' },
			],
		};

		expect(Object.keys(result).length).to.eql(2);
		expect(result).to.eql(expectedResult);
	});

	it('should skip entity with no matching schema', () => {
		const records: EntityData = {
			unknown_schema_name: [{ id: 999 }],
		};

		const result = parseRecordsToEdit(records, inventoryDictionary);
		expect(Object.keys(result).length).to.eql(0);
	});

	it('should skip entity if entity data has no records', () => {
		const records: EntityData = {
			user: [],
			product: [
				{ id: 101, name: 'Laptop' },
				{ id: 102, name: 'Monitor' },
			],
		};

		const expectedResult: Record<string, DataRecord[]> = {
			product: [
				{ id: 101, name: 'Laptop' },
				{ id: 102, name: 'Monitor' },
			],
		};

		const result = parseRecordsToEdit(records, inventoryDictionary);
		expect(Object.keys(result).length).to.eql(1);
		expect(result).to.eql(expectedResult);
	});
});
