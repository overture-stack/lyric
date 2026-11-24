import type { Meta, StoryObj } from '@storybook/react';
import { DotIcon } from 'lucide-react';

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from './breadcrumb';

const meta: Meta<typeof Breadcrumb> = {
	title: 'Components/Breadcrumb',
	component: Breadcrumb,
	tags: ['autodocs'],
	parameters: {
		layout: 'centered',
	},
	argTypes: {},
};

export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const Default: Story = {
	render: () => (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink href="#">Home</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbLink href="#">Components</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbPage>Breadcrumb</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	),
};

export const CustomSeparator: Story = {
	render: () => (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<a href="#">Home</a>
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator>
					<DotIcon />
				</BreadcrumbSeparator>
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<a href="#">Components</a>
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator>
					<DotIcon />
				</BreadcrumbSeparator>
				<BreadcrumbItem>
					<BreadcrumbPage>Breadcrumb</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	),
};
