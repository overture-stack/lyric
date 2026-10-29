import { SchemasDictionary, SubmissionDataSummaryRepositoryRecord } from '@overture-stack/lyric';

export const validResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'VALID',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const validatingResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
			sociodemographic: {
				batchName: 'sociodemographic.tsv',
				recordsCount: 1,
			},
			measurement: {
				batchName: 'diagnosis.tsv',
				recordsCount: 1,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'VALIDATING',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const openResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'OPEN',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const committingResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'COMMITTING',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const committedResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'COMMITTED',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const invalidResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment.tsv',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant.tsv',
				recordsCount: 5,
			},
		},
	},
	dictionary: {
		name: 'test_pcgl_schema',
		version: '1.20',
	},
	dictionaryCategory: {
		id: 1,
		name: 'TEST_CATEGORY_1',
	},
	errors: {
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
	},
	organization: 'TEST_CATEGORY_1',
	status: 'INVALID',
	createdAt: new Date(),
	createdBy: '',
	updatedAt: new Date(),
	updatedBy: '',
};

export const testDictionary: SchemasDictionary = {
	name: 'test_pcgl_schema',
	description: 'Base clinical schema that incorporates all PCGL base entities',
	version: '1.20',
	schemas: [
		{
			name: 'participant',
			description: '...',
			fields: [],
		},
		{
			name: 'sociodemographic',
			description: '...',
			fields: [],
		},
		{
			name: 'demographic',
			description: '...',
			fields: [],
		},
		{
			name: 'diagnosis',
			description: '...',
			fields: [],
		},
		{
			name: 'treatment',
			description: '...',
			fields: [],
		},
		{
			name: 'follow_up',
			description: '...',
			fields: [],
		},
		{
			name: 'procedure',
			description: '...',
			fields: [],
		},
		{
			name: 'medication',
			description: '...',
			fields: [],
		},
		{
			name: 'radiation',
			description: '...',
			fields: [],
		},
		{
			name: 'measurement',
			description: '...',
			fields: [],
		},
		{
			name: 'phenotype',
			description: '...',
			fields: [],
		},
		{
			name: 'comorbidity',
			description: '...',
			fields: [],
		},
		{
			name: 'exposure',
			description: '...',
			fields: [],
		},
		{
			name: 'specimen',
			description: '...',
			fields: [],
		},
		{
			name: 'sample',
			description: '...',
			fields: [],
		},
		{
			name: 'experiment',
			description: '...',
			fields: [],
		},
		{
			name: 'read_group',
			description: '...',
			fields: [],
		},
	],
};

export const errorSummaryMock = [
	{
		field: 'age_at_treatment',
		errorType: 'INVALID_BY_RANGE',
		details: 'The value must be within the range.',
		errorValue: '999',
		rowsAffected: 45,
	},
	{
		field: 'submitter_treatment_id',
		errorType: 'INVALID_BY_REGEX',
		details: 'The value must match the regular expression.',
		errorValue: 'abc*7878(99',
		rowsAffected: 1,
	},
	{
		field: 'treatment_type',
		errorType: 'INVALID_ENUM_VALUE',
		details: 'The value for this field must match an option from the list.',
		errorValue: 'Drugs',
		rowsAffected: 18,
	},
	{
		field: 'age_at_treatment',
		errorType: 'INVALID_FIELD_VALUE_TYPE',
		details: 'Value type of this field is incorrect.',
		errorValue: '"age"',
		rowsAffected: 11,
	},
	{
		field: 'treatment_type',
		errorType: 'MISSING_REQUIRED_FIELD',
		details: 'A value is required for this field and cannot be empty.',
		errorValue: '""',
		rowsAffected: 1,
	},
	{
		field: 'submitter_participant_id',
		errorType: 'INVALID_BY_FOREIGNKEY',
		details: 'Field "submitter_participant_id" does not exist in "Participant" file.',
		errorValue: 'participant-123',
		rowsAffected: 5,
	},
	{
		field: 'phone_number',
		errorType: 'UNRECOGNIZED_FIELD',
		details: 'This field is not defined in the current schema.',
		errorValue: '123456789',
		rowsAffected: 27,
	},
	{
		field: 'submitter_treatment_id',
		errorType: 'DUPLICATE_RECORD',
		details: 'This record already exists.',
		errorValue: 'treatment_123',
		rowsAffected: 18,
	},
];
