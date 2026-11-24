import type { Meta, StoryObj } from '@storybook/react';

import { Banner } from './banner';

const meta: Meta<typeof Banner> = {
	title: 'Components/Banner',
	component: Banner,
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['info', 'error', 'success', 'warning'],
		},
		dismissible: {
			options: [true, false],
			control: { type: 'boolean' },
		},
		bannerTitle: {
			control: { type: 'text' },
		},
		bannerDescription: {
			control: { type: 'text' },
		},
	},
};

export default meta;

type Story = StoryObj<typeof Banner>;

const args = {
	bannerTitle: 'Alert title',
	bannerDescription: 'Example text if more description is needed.',
};

export const Info: Story = {
	args: {
		...args,
		variant: 'info',
	},
};

export const Error: Story = {
	args: {
		...args,
		variant: 'error',
	},
};

export const Success: Story = {
	args: {
		...args,
		variant: 'success',
	},
};

export const Warning: Story = {
	args: {
		...args,
		variant: 'warning',
	},
};
