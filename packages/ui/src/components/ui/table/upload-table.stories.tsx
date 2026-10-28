import { Meta, StoryObj } from '@storybook/react';

import { UploadSubmissionViewTable } from './UploadSubmissionTable';
import {
	committedResponse,
	committingResponse,
	invalidResponse,
	validatingResponse,
	validResponse,
} from './utils/mock';

const meta: Meta<typeof UploadSubmissionViewTable> = {
	title: 'Components/Table',
	component: UploadSubmissionViewTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadSubmissionViewTable>;

// FRONTEND VALIDATION

// RESPONSE FROM SERVER
export const ValidatingTable: Story = {
	args: { submissionResponse: validatingResponse },
};

export const ValidTable: Story = {
	args: { submissionResponse: validResponse },
};

export const CommitingTable: Story = {
	args: { submissionResponse: committingResponse },
};

export const CommitedTable: Story = {
	args: { submissionResponse: committedResponse },
};

export const InvalidTable: Story = {
	args: { submissionResponse: invalidResponse },
};
