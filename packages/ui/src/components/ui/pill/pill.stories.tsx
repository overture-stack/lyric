import type { Meta, StoryObj } from '@storybook/react';

import { Pill } from './pill';

const meta: Meta<typeof Pill> = {
	title: 'Components/Pill',
	component: Pill,
	tags: ['autodocs'],
	argTypes: {
		status: {
			control: 'select',
			options: ['default', 'error', 'warning', 'success'],
		},
	},
};

export default meta;

type Story = StoryObj<typeof Pill>;

export const ValidationInProgress: Story = {
	args: {
		status: 'default',
	},
};

export const ReadyForValidation: Story = {
	args: {
		status: 'success',
	},
};

export const ActionRequired: Story = {
	args: {
		status: 'warning',
	},
};

export const Error: Story = {
	args: {
		status: 'error',
	},
};
