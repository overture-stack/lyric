import { SubmissionDataSummaryRepositoryRecord } from '@overture-stack/lyric';

export const validResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant',
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
				batchName: 'treatment',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant',
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

export const openResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant',
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

export const commitingResponse: SubmissionDataSummaryRepositoryRecord = {
	id: 1,
	data: {
		inserts: {
			treatment: {
				batchName: 'treatment',
				recordsCount: 3,
			},
			participant: {
				batchName: 'participant',
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
