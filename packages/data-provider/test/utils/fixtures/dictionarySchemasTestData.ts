import { Schema } from '@overture-stack/lectern-client';
import { Dictionary } from '@overture-stack/lyric-data-model/models';

export const dictionarySportsData: Schema[] = [
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
		name: 'team',
		fields: [
			{
				name: 'team_id',
				valueType: 'string',
				description: 'Unique identifier of the team.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'sport_id',
				valueType: 'string',
				description: 'Unique identifier of the sport the team plays.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: 'string',
				description: 'Name of the team.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'coach',
				valueType: 'string',
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
				valueType: 'string',
				description: 'Unique identifier of the player.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'team_id',
				valueType: 'string',
				description: 'Unique identifier of the team the player belongs to.',
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
				name: 'position',
				valueType: 'string',
				description: 'Position of the player in the team.',
				restrictions: {
					required: false,
				},
			},
			{
				name: 'age',
				valueType: 'integer',
				description: 'Age of the player',
				restrictions: {
					required: true,
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
				valueType: 'string',
				description: 'Unique identifier of the game.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'sport_id',
				valueType: 'string',
				description: 'Unique identifier of the sport being played.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'date',
				valueType: 'string',
				description: 'Date of the game.',
				restrictions: {
					regex: '^\\d{4}-(0[1-9]|1[012])-\\d{2}$',
					required: true,
				},
			},
			{
				name: 'location',
				valueType: 'string',
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
	player: [],
	game: [],
} as const;

export const dictionaryClinicalSchemas: Schema[] = [
	{
		name: 'study',
		fields: [],
	},
	{
		name: 'participant',
		fields: [],
		restrictions: {
			foreignKey: [
				{
					schema: 'study',
					mappings: [
						{
							local: 'study_id',
							foreign: 'study_id',
						},
					],
				},
			],
		},
	},
	{
		name: 'sample',
		fields: [],
		restrictions: {
			foreignKey: [
				{
					schema: 'study',
					mappings: [
						{
							local: 'study_id',
							foreign: 'study_id',
						},
					],
				},
				{
					schema: 'participant',
					mappings: [
						{
							local: 'submitter_participant_id',
							foreign: 'submitter_participant_id',
						},
					],
				},
				{
					schema: 'specimen',
					mappings: [
						{
							local: 'submitter_specimen_id',
							foreign: 'submitter_specimen_id',
						},
					],
				},
			],
		},
	},
	{
		name: 'specimen',
		fields: [],
		restrictions: {
			foreignKey: [
				{
					schema: 'study',
					mappings: [
						{
							local: 'study_id',
							foreign: 'study_id',
						},
					],
				},
				{
					schema: 'participant',
					mappings: [
						{
							local: 'submitter_participant_id',
							foreign: 'submitter_participant_id',
						},
					],
				},
			],
		},
	},
];
