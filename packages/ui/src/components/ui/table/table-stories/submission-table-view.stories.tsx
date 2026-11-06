import { Meta, StoryObj } from '@storybook/react';

import { SubmissionTable } from '../SubmissionTable.js';
import {
	committedResponse,
	committingResponse,
	invalidResponse,
	testDictionary,
	validatingResponse,
	validResponse,
} from '../utils/mock.js';

const meta: Meta<typeof SubmissionTable> = {
	title: 'Components/SubmissionTable/State Views',
	component: SubmissionTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof SubmissionTable>;

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
