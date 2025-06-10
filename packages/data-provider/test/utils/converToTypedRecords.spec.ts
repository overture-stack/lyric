import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Schema } from '@overture-stack/lectern-client';

import { convertToTypedRecords } from '../../src/utils/recordsParser.js';

describe('convertToTypedRecords', () => {
	const schema: Schema = {
		name: 'sport',
		fields: [
			{
				name: 'sport_id',
				valueType: 'string',
				description: 'Unique identifier of the sport.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: 'string',
				description: 'Name of the sport.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'num_players',
				valueType: 'integer',
				description: 'Number of players.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'is_aquatic',
				valueType: 'boolean',
				description: 'Sport is aquatic.',
				restrictions: {
					required: true,
				},
			},
		],
	};
	it('should parse records to their corresponding data types based on the schema', () => {
		const inputRecords: Record<string, unknown>[] = [
			{
				sport_id: '1',
				name: 'Soccer',
				num_players: '11',
				is_aquatic: 'FALSE',
			},
		];

		const result = convertToTypedRecords(inputRecords, schema);
		expect(result.length).eql(1);
		expect(result[0].sport_id).eql('1');
		expect(result[0].name).eql('Soccer');
		expect(result[0].num_players).eql(11);
		expect(result[0].is_aquatic).eql(false);
	});
	it('should return all records even records with invalid data types', () => {
		const inputRecords: Record<string, unknown>[] = [
			{
				sport_id: '6',
				name: 'Volleyball',
				num_players: 11,
				is_aquatic: 'FALSE',
			},
			{
				sport_id: '7',
				name: 123,
				num_players: 'NaN',
				is_aquatic: 'NO',
			},
		];

		const result = convertToTypedRecords(inputRecords, schema);
		expect(result.length).eql(2);
		expect(result).eql([
			{
				sport_id: '6',
				name: 'Volleyball',
				num_players: 11,
				is_aquatic: false,
			},
			{
				sport_id: '7',
				name: '123',
				num_players: 'NaN',
				is_aquatic: 'NO',
			},
		]);
	});
	it('should omit empty records', () => {
		const inputRecords: Record<string, unknown>[] = [
			{
				sport_id: '6',
				name: 'Volleyball',
				num_players: 11,
				is_aquatic: 'FALSE',
			},
			{},
			{},
		];

		const result = convertToTypedRecords(inputRecords, schema);
		expect(result.length).eql(1);
		expect(result).eql([
			{
				sport_id: '6',
				name: 'Volleyball',
				num_players: 11,
				is_aquatic: false,
			},
		]);
	});
});
