import type { Meta, StoryObj } from '@storybook/react';

import { Dropzone } from './dropzone';

const meta: Meta<typeof Dropzone> = {
	title: 'Components/Dropzone',
	component: Dropzone,
	tags: ['autodocs'],
	argTypes: {
		disabled: {
			control: 'boolean',
		},
	},
};

export default meta;

type Story = StoryObj<typeof Dropzone>;

const text = {
	instructionsText: 'Drag and drop your file(s) here or',
	buttonText: 'Add Files',
};

export const Default: Story = {
	args: {
		...text,
		disabled: false,
	},
};
