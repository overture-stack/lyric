import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Schema } from '@overture-stack/lectern-client';

import { getSchemaParser } from '../../src/utils/recordsParser.js';

describe('Parse sunprocessed record into a schema data type', () => {
	it('should parse a valid string as boolean', () => {
		const unProcessedRecords = {
			sport_id: '1',
			name: 'Soccer',
			num_players: '11',
			is_aquatic: 'false',
		};

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

		const parser = getSchemaParser(schema);
		const parsedRecord = parser(unProcessedRecords);
		expect(Object.keys(parsedRecord).length).to.eql(4);
		expect(parsedRecord).to.eql({
			sport_id: '1',
			name: 'Soccer',
			num_players: 11,
			is_aquatic: false,
		});
	});
	it('should not parse an invalid string as boolean', () => {
		const unProcessedRecords = {
			sport_id: '1',
			name: 'Soccer',
			num_players: '11',
			is_aquatic: 'no',
		};

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

		const parser = getSchemaParser(schema);
		const parsedRecord = parser(unProcessedRecords);
		expect(Object.keys(parsedRecord).length).to.eql(4);
		expect(parsedRecord).to.eql({
			sport_id: '1',
			name: 'Soccer',
			num_players: 11,
			is_aquatic: 'no',
		});
	});
	it('should not parse an invalid string as number', () => {
		const unProcessedRecords = {
			sport_id: '1',
			name: 'Soccer',
			num_players: 'eleven',
			is_aquatic: 'no',
		};

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

		const parser = getSchemaParser(schema);
		const parsedRecord = parser(unProcessedRecords);
		expect(Object.keys(parsedRecord).length).to.eql(4);
		expect(parsedRecord).to.eql({
			sport_id: '1',
			name: 'Soccer',
			num_players: 'eleven',
			is_aquatic: 'no',
		});
	});
});
