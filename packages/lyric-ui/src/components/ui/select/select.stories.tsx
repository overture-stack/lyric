import type { Meta, StoryObj } from '@storybook/react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from './select';

const meta: Meta<typeof Select> = {
	title: 'Components/Select',
	component: Select,
	tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Select>;

const fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry'];

export const Default: Story = {
	render: () => (
		<Select defaultValue="apple">
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				{fruits.map((fruit) => (
					<SelectItem key={fruit} value={fruit.toLowerCase()}>
						{fruit}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
};

export const Placeholder: Story = {
	render: () => (
		<Select>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				{fruits.map((fruit) => (
					<SelectItem key={fruit} value={fruit.toLowerCase()}>
						{fruit}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
};

export const SmallSize: Story = {
	render: () => (
		<Select defaultValue="apple">
			<SelectTrigger size="sm" className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				{fruits.map((fruit) => (
					<SelectItem key={fruit} value={fruit.toLowerCase()}>
						{fruit}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
};

export const Grouped: Story = {
	render: () => (
		<Select>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectLabel>Tropical</SelectLabel>
					{['Mango', 'Papaya', 'Pineapple'].map((fruit) => (
						<SelectItem key={fruit} value={fruit.toLowerCase()}>
							{fruit}
						</SelectItem>
					))}
				</SelectGroup>
				<SelectSeparator />
				<SelectGroup>
					<SelectLabel>Citrus</SelectLabel>
					{['Lemon', 'Lime', 'Orange'].map((fruit) => (
						<SelectItem key={fruit} value={fruit.toLowerCase()}>
							{fruit}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	),
};

export const Disabled: Story = {
	render: () => (
		<Select defaultValue="apple" disabled>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				{fruits.map((fruit) => (
					<SelectItem key={fruit} value={fruit.toLowerCase()}>
						{fruit}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
};

export const WithDisabledItem: Story = {
	render: () => (
		<Select>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Select a fruit..." />
			</SelectTrigger>
			<SelectContent>
				{fruits.map((fruit) => (
					<SelectItem key={fruit} value={fruit.toLowerCase()} disabled={fruit === 'Banana'}>
						{fruit}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
};
