import type { Meta, StoryObj } from '@storybook/react';
import { Download } from 'lucide-react';

import { Button } from './button';

const meta: Meta<typeof Button> = {
	title: 'Components/Button',
	component: Button,
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
		},
		size: {
			control: 'select',
			options: ['default', 'sm', 'lg', 'icon'],
		},
	},
	args: {
		children: 'Button',
	},
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
	args: {
		variant: 'default',
	},
};

export const DefaultWithIcon: Story = {
	args: {
		variant: 'default',
		icon: <Download />,
	},
};

export const Secondary: Story = {
	args: {
		variant: 'secondary',
	},
};

export const Destructive: Story = {
	args: {
		variant: 'destructive',
	},
};

export const Outline: Story = {
	args: {
		variant: 'outline',
	},
};

export const Ghost: Story = {
	args: {
		variant: 'ghost',
	},
};

export const Link: Story = {
	args: {
		variant: 'link',
	},
};
