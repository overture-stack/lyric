import { expect } from 'chai';
import { describe, it } from 'mocha';

import type {
	DataRecord,
	Dictionary as SchemasDictionary,
	DictionaryValidationError,
	DictionaryValidationRecordErrorDetails,
	SchemaRecordError,
} from '@overture-stack/lectern-client';

import { validateSchemas } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Validate Data using a Dictionary', () => {
	const dictionary: SchemasDictionary & {
		id: number;
	} = {
		id: 1,
		name: 'test dictionary',
		version: '1.0.0',
		schemas: [
			{
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
						name: 'description',
						valueType: 'string',
						description: 'Description of the sport.',
						restrictions: {
							required: false,
						},
					},
				],
				description: 'The collection of data elements required to register a sport.',
				restrictions: {},
			},
			{
				name: 'player',
				fields: [
					{
						name: 'player_id',
						valueType: 'string',
						description: 'Unique identifier of the player.',
						restrictions: {
							required: true,
						},
					},
					{
						name: 'name',
						valueType: 'string',
						description: 'Name of the player.',
						restrictions: {
							required: true,
						},
					},
					{
						name: 'sport_id',
						valueType: 'string',
						description: 'Sport the player plays',
						restrictions: {
							required: true,
						},
					},
				],
				description: 'The collection of data elements required to register a sport.',
				restrictions: {
					foreignKey: [
						{
							schema: 'sport',
							mappings: [
								{
									local: 'sport_id',
									foreign: 'sport_id',
								},
							],
						},
					],
				},
			},
		],
	};
	it('returns valid response', () => {
		const data: Record<string, DataRecord[]> = {
			sport: [{ sport_id: 'FOOT001', name: 'Footbal', description: 'Foot ball game' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(true);
	});
	it('returns invalid validation with unrecognized schema', () => {
		const data: Record<string, DataRecord[]> = {
			food: [{ food_id: 1, name: 'Pizza' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(false);
		expect(Object.keys(response)).to.eql(['valid', 'details']);
		const details: DictionaryValidationError[] = response.valid === false ? response.details : [];
		expect(details.length).to.eq(1);
		expect(details[0]['reason']).to.eql('UNRECOGNIZED_SCHEMA');
		expect(details[0]['schemaName']).to.eql('food');
	});
	it('returns invalid validation with invalid value type error', () => {
		const data: Record<string, DataRecord[]> = {
			sport: [{ sport_id: 1, name: 'Footbal', description: 'Foot ball game' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(false);
		expect(Object.keys(response)).to.eql(['valid', 'details']);
		const details: DictionaryValidationError[] = response.valid === false ? response.details : [];
		expect(details.length).to.eq(1);
		expect(details[0]['reason']).to.eql('INVALID_RECORDS');
		expect(details[0]['schemaName']).to.eql('sport');
		const invalidRecords: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] =
			details[0].reason === 'INVALID_RECORDS' ? details[0].invalidRecords : [];
		expect(invalidRecords.length).to.eq(1);
		expect(invalidRecords[0]['recordIndex']).to.eq(0);
		expect(invalidRecords[0]['recordErrors'][0]).to.eql({
			fieldName: 'sport_id',
			fieldValue: 1,
			isArray: false,
			reason: 'INVALID_VALUE_TYPE',
			valueType: 'string',
		});
	});
	it('returns invalid validation with missing required field', () => {
		const data: Record<string, DataRecord[]> = {
			sport: [{ name: 'Footbal', description: 'Foot ball game' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(false);
		expect(Object.keys(response)).to.eql(['valid', 'details']);
		const details: DictionaryValidationError[] = response.valid === false ? response.details : [];
		expect(details.length).to.eq(1);
		expect(details[0]['reason']).to.eql('INVALID_RECORDS');
		expect(details[0]['schemaName']).to.eql('sport');
		const invalidRecords: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] =
			details[0].reason === 'INVALID_RECORDS' ? details[0].invalidRecords : [];
		expect(invalidRecords.length).to.eq(1);
		expect(invalidRecords[0]['recordIndex']).to.eq(0);
		expect(invalidRecords[0]['recordErrors'][0]).to.eql({
			fieldName: 'sport_id',
			fieldValue: undefined,
			reason: 'INVALID_BY_RESTRICTION',
			errors: [
				{
					message: 'A value is required for this field.',
					restriction: { type: 'required', rule: true },
				},
			],
		});
	});
	it('returns invalid validation with unknown field', () => {
		const data: Record<string, DataRecord[]> = {
			sport: [{ sport_id: 'FOOT001', name: 'Footbal', description: 'Foot ball game', extra_field: 'ABC' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(false);
		expect(Object.keys(response)).to.eql(['valid', 'details']);
		const details: DictionaryValidationError[] = response.valid === false ? response.details : [];
		expect(details.length).to.eq(1);
		expect(details[0]['reason']).to.eql('INVALID_RECORDS');
		expect(details[0]['schemaName']).to.eql('sport');
		const invalidRecords: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] =
			details[0].reason === 'INVALID_RECORDS' ? details[0].invalidRecords : [];
		expect(invalidRecords.length).to.eq(1);
		expect(invalidRecords[0]['recordIndex']).to.eq(0);
		expect(invalidRecords[0]['recordErrors'][0]).to.eql({
			fieldName: 'extra_field',
			fieldValue: 'ABC',
			reason: 'UNRECOGNIZED_FIELD',
		});
	});
	it('returns invalid validation with invalid foreign key', () => {
		const data: Record<string, DataRecord[]> = {
			player: [{ player_id: 'PPP01', name: 'Pedro', sport_id: '1234' }],
		};

		const response = validateSchemas(dictionary, data);
		expect(response.valid).to.eql(false);
		expect(Object.keys(response)).to.eql(['valid', 'details']);
		const details: DictionaryValidationError[] = response.valid === false ? response.details : [];
		expect(details.length).to.eq(1);
		expect(details[0]['reason']).to.eql('INVALID_RECORDS');
		expect(details[0]['schemaName']).to.eql('player');
		const invalidRecords: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] =
			details[0].reason === 'INVALID_RECORDS' ? details[0].invalidRecords : [];
		expect(invalidRecords.length).to.eq(1);
		expect(invalidRecords[0]['recordIndex']).to.eq(0);
		expect(invalidRecords[0]['recordErrors'][0]).to.eql({
			fieldName: 'sport_id',
			fieldValue: '1234',
			foreignSchema: {
				fieldName: 'sport_id',
				schemaName: 'sport',
			},
			reason: 'INVALID_BY_FOREIGNKEY',
		});
	});
});
