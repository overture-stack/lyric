import type { Meta, StoryObj } from '@storybook/react';

import { PersonTable } from './table';

const meta: Meta<typeof PersonTable> = {
	title: 'Components/Table',
	component: PersonTable,
	tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof PersonTable>;

export const Default: Story = {};
