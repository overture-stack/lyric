import { Meta, StoryObj } from '@storybook/react';

import { Commit, UploadSubmission } from './types';
import { UploadSubmissionViewTable } from './UploadSubmissionTable';

const meta: Meta<typeof UploadSubmissionViewTable> = {
	title: 'Components/Table',
	component: UploadSubmissionViewTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadSubmissionViewTable>;

export const testData: Commit = {
	id: 2,
	data: {
		deletes: null,
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
		updates: null,
		total: 8,
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
		deletes: null,
		inserts: {
			treatment: {
				recordsCount: 3,
			},
			participant: {
				recordsCount: 4,
			},
		},
		updates: null,
		total: 7,
	},
	organization: 'TEST_CATEGORY_1',
	status: 'INVALID',
	createdAt: '2026-10-22T17:38:11.752Z',
	createdBy: '',
	updatedAt: '2026-10-22T17:51:37.358Z',
	updatedBy: '',
};

export const DefaultUploadTable: Story = {
	args: { data: testData },
};
