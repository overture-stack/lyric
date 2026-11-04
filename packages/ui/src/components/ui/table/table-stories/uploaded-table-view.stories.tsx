import { Meta, StoryObj } from '@storybook/react';

import { UploadedSubmissionTable } from '../UploadedSubmissionTable.js';
import {
	committedResponse,
	committingResponse,
	invalidResponse,
	testDictionary,
	validatingResponse,
	validResponse,
} from '../utils/mock.js';

const meta: Meta<typeof UploadedSubmissionTable> = {
	title: 'Components/UploadedSubmissionTable/view',
	component: UploadedSubmissionTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadedSubmissionTable>;

const defaultHandler = {
	deleteHandler: () => {},
	downloadFileHandler: () => {},
	downloadErrorFileHandler: () => {},
	changeEntityHandler: (_: string | number, __: string) => {},
};

// RESPONSE FROM SERVER
export const ValidTable: Story = {
	args: {
		submissionResponse: validResponse,
		dictionary: testDictionary,
		fileActions: [],
		handlers: defaultHandler,
	},
};
export const ValidatingTable: Story = {
	args: {
		submissionResponse: validatingResponse,
		dictionary: testDictionary,
		fileActions: [],
		handlers: defaultHandler,
	},
};

export const CommitingTable: Story = {
	args: {
		submissionResponse: committingResponse,
		dictionary: testDictionary,
		fileActions: [],
		handlers: defaultHandler,
	},
};

export const CommitedTable: Story = {
	args: {
		submissionResponse: committedResponse,
		dictionary: testDictionary,
		fileActions: [],
		handlers: defaultHandler,
	},
};
export const InvalidTable: Story = {
	args: { submissionResponse: invalidResponse, dictionary: testDictionary, fileActions: [], handlers: defaultHandler },
};
