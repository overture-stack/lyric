import { Meta, StoryObj } from '@storybook/react';

import { UploadSubmissionViewTable } from './UploadSubmissionTable';
import { commitingResponse, openResponse, validatingResponse, validResponse } from './utils/mock';

const meta: Meta<typeof UploadSubmissionViewTable> = {
	title: 'Components/Table',
	component: UploadSubmissionViewTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof UploadSubmissionViewTable>;

// FRONTEND VALIDATION
export const CommitedTable: Story = {
	args: { submissionResponse: openResponse },
};

// RESPONSE FROM SERVER

export const ValidatingTable: Story = {
	args: { submissionResponse: validatingResponse },
};

export const ValidTable: Story = {
	args: { submissionResponse: validResponse },
};

export const CommitingTable: Story = {
	args: { submissionResponse: commitingResponse },
};
