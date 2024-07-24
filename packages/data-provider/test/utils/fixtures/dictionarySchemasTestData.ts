import { Dictionary } from '@overture-stack/lyric-data-model';
import { SchemaDefinition, ValueType } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

const dictionarySportsData: SchemaDefinition[] = [
	{
		name: 'sport',
		fields: [
			{
				name: 'sport_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the sport.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: ValueType.STRING,
				description: 'Name of the sport.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'description',
				valueType: ValueType.STRING,
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
		name: 'team',
		fields: [
			{
				name: 'team_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the team.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'sport_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the sport the team plays.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: ValueType.STRING,
				description: 'Name of the team.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'coach',
				valueType: ValueType.STRING,
				description: "Name of the team's coach.",
				restrictions: {
					required: false,
				},
			},
		],
		description: 'The collection of data elements required to register a team.',
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
	{
		name: 'player',
		fields: [
			{
				name: 'player_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the player.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'team_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the team the player belongs to.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: ValueType.STRING,
				description: 'Name of the player.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'position',
				valueType: ValueType.STRING,
				description: 'Position of the player in the team.',
				restrictions: {
					required: false,
				},
			},
		],
		description: 'The collection of data elements required to register a player.',
		restrictions: {
			foreignKey: [
				{
					schema: 'team',
					mappings: [
						{
							local: 'team_id',
							foreign: 'team_id',
						},
					],
				},
			],
		},
	},
	{
		name: 'game',
		fields: [
			{
				name: 'game_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the game.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'sport_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the sport being played.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'date',
				valueType: ValueType.STRING,
				description: 'Date of the game.',
				restrictions: {
					regex: '^\\d{4}-(0[1-9]|1[012])-\\d{2}$',
					required: true,
				},
			},
			{
				name: 'location',
				valueType: ValueType.STRING,
				description: 'Location of the game.',
				restrictions: {
					required: false,
				},
			},
		],
		description: 'The collection of data elements required to register a game.',
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
] as const;

export const dictionarySportStats: Dictionary = {
	id: 1,
	name: 'test dictionary',
	version: '1.0.0',
	dictionary: dictionarySportsData,
	createdAt: new Date(),
	createdBy: '',
} as const;

export const dictionarySportStatsNodeGraph = {
	sport: [
		{ schemaName: 'team', fieldName: 'sport_id', parent: { schemaName: 'sport', fieldName: 'sport_id' } },
		{ schemaName: 'game', fieldName: 'sport_id', parent: { schemaName: 'sport', fieldName: 'sport_id' } },
	],
	team: [
		{
			schemaName: 'player',
			fieldName: 'team_id',
			parent: { schemaName: 'team', fieldName: 'team_id' },
		},
	],
} as const;
