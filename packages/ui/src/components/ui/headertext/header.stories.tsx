import type { Meta, StoryObj } from '@storybook/react';

import { HeaderText } from './HeaderText';

const meta: Meta<typeof HeaderText> = {
	title: 'Components/HeaderText',
	component: HeaderText,
	tags: ['autodocs'],
	argTypes: {
		status: {
			control: 'select',
			options: ['validation_in_progress', 'ready_for_validation', 'action_required'],
		},
	},
};

export default meta;

type Story = StoryObj<typeof HeaderText>;

export const ValidationInProgress: Story = {
	args: {
		title: 'Submission PCGL-12456',
		status: 'validation_in_progress',
	},
};

export const ReadyForValidation: Story = {
	args: {
		title: 'New Submission',
		status: 'ready_for_validation',
	},
};

export const ActionRequired: Story = {
	args: {
		title: 'New Submission',
		status: 'action_required',
	},
};

export const NoStatus: Story = {
	args: {
		title: 'New Submission',
	},
};
