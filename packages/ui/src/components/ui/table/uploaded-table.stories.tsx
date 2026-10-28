import { Meta, StoryObj } from '@storybook/react';

import { UploadedSubmissionTable } from './UploadedSubmissionTable';
import {
	committedResponse,
	committingResponse,
	invalidResponse,
	testDictionary,
	validatingResponse,
	validResponse,
} from './utils/mock';

const meta: Meta<typeof UploadedSubmissionTable> = {
	title: 'Components/UploadedSubmissionTable',
	component: UploadedSubmissionTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadedSubmissionTable>;

// RESPONSE FROM SERVER
export const ValidTable: Story = {
	args: { submissionResponse: validResponse, dictionary: testDictionary },
};
export const ValidatingTable: Story = {
	args: { submissionResponse: validatingResponse, dictionary: testDictionary },
};

export const CommitingTable: Story = {
	args: { submissionResponse: committingResponse, dictionary: testDictionary },
};

export const CommitedTable: Story = {
	args: { submissionResponse: committedResponse, dictionary: testDictionary },
};

export const InvalidTable: Story = {
	args: { submissionResponse: invalidResponse, dictionary: testDictionary },
};
