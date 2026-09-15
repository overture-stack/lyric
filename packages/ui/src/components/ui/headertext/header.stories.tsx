import type { Meta, StoryObj } from '@storybook/react';

import { HeaderText } from './headertext';

const meta: Meta<typeof HeaderText> = {
	title: 'Components/HeaderText',
	component: HeaderText,
	tags: ['autodocs'],
	argTypes: {
		status: {
			control: 'select',
			options: ['default', 'error', 'warning', 'success'],
		},
	},
};

export default meta;

type Story = StoryObj<typeof HeaderText>;

export const ValidationInProgress: Story = {
	args: {
		title: 'Submission TEST-12456',
		status: 'default',
	},
};

export const ReadyForValidation: Story = {
	args: {
		title: 'New Submission',
		status: 'success',
	},
};

export const ActionRequired: Story = {
	args: {
		title: 'New Submission',
		status: 'warning',
	},
};

export const Error: Story = {
	args: {
		title: 'Submission TEST-12456',
		status: 'error',
	},
};

export const NoStatus: Story = {
	args: {
		title: 'New Submission',
	},
};
