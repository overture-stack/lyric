import { Dictionary } from '@overture-stack/lyric-data-model';
import { SchemaDefinition, ValueType } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

const sampleDictionaryData: SchemaDefinition[] = [
	{
		name: 'study',
		fields: [
			{
				name: 'study_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the study.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'name',
				valueType: ValueType.STRING,
				description: 'Study name',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'description',
				valueType: ValueType.STRING,
				description: 'Information about the study',
				restrictions: {
					required: true,
				},
			},
		],
		description: 'The collection of data elements required to register the study program.',
		restrictions: {},
	},
	{
		name: 'participant',
		fields: [
			{
				name: 'study_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the study.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'submitter_participant_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier for the participant, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
			{
				name: 'sex_at_birth',
				valueType: ValueType.STRING,
				description:
					"Refers to sex assigned at birth. Sex at birth is typically assigned based on a person's reproductive system and other physical characteristics. The provided values are based on the categories defined by Statistics Canada",
				restrictions: {
					codeList: ['Male', 'Female'],
					required: true,
				},
			},
			{
				name: 'gender',
				valueType: ValueType.STRING,
				description:
					"Refers to an individual's personal and social identity as a man, woman or non-binary person (a person who is not exclusively a man or a woman). The provided values are based on the categories defined by Statistics Canada",
				restrictions: {
					codeList: ['Man', 'Woman', 'Non-binary person'],
					required: false,
				},
			},
		],
		description: 'The collection of data elements related to a specific donor',
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
		fields: [
			{
				name: 'study_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the study.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'submitter_participant_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier for the participant, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
			{
				name: 'submitter_specimen_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the specimen, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
			{
				name: 'submitter_sample_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the sample, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
		],
		description: 'The collection of data elements required to register the required Donor-Specimen-Sample data',
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
		fields: [
			{
				name: 'study_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the study.',
				restrictions: {
					required: true,
				},
			},
			{
				name: 'submitter_participant_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier for the participant, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
			{
				name: 'submitter_specimen_id',
				valueType: ValueType.STRING,
				description: 'Unique identifier of the specimen, assigned by the data provider.',
				restrictions: {
					regex: '^[A-Za-z0-9\\-\\._]+$',
					required: true,
				},
			},
			{
				name: 'specimen_collection_date',
				valueType: ValueType.STRING,
				description: 'Indicate the date when the specimen was collected from donor.',
				restrictions: {
					regex: '^\\d{4}-(0[1-9]|1[012])$',
					required: true,
				},
			},
		],
		description:
			"The collection of data elements related to a donor's specimen. A specimen is any material sample taken for testing, diagnostic or research purposes.",
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

export const sampleDictionary: Dictionary = {
	id: 1,
	name: 'test dictionary',
	version: '1.0.0',
	dictionary: sampleDictionaryData,
	createdAt: new Date(),
	createdBy: '',
};

export const sampleChildrenNodes = {
	study: [
		{ schemaName: 'participant', fieldName: 'study_id', parent: { schemaName: 'study', fieldName: 'study_id' } },
		{ schemaName: 'sample', fieldName: 'study_id', parent: { schemaName: 'study', fieldName: 'study_id' } },
		{ schemaName: 'specimen', fieldName: 'study_id', parent: { schemaName: 'study', fieldName: 'study_id' } },
	],
	participant: [
		{
			schemaName: 'sample',
			fieldName: 'submitter_participant_id',
			parent: { schemaName: 'participant', fieldName: 'submitter_participant_id' },
		},
		{
			schemaName: 'specimen',
			fieldName: 'submitter_participant_id',
			parent: { schemaName: 'participant', fieldName: 'submitter_participant_id' },
		},
	],
	specimen: [
		{
			schemaName: 'sample',
			fieldName: 'submitter_specimen_id',
			parent: { schemaName: 'specimen', fieldName: 'submitter_specimen_id' },
		},
	],
};
