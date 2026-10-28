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
