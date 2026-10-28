import type { Meta, StoryObj } from '@storybook/react';

import { SubmissionViewTable } from './SubmissionViewTable';

const meta: Meta<typeof SubmissionViewTable> = {
	title: 'Components/ViewTable',
	component: SubmissionViewTable,
	tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof SubmissionViewTable>;

export const Default: Story = {
	args: {},
};
