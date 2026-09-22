import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '@/components/ui/button';

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from './dialog';

const meta: Meta<typeof DialogContent> = {
	title: 'Components/Dialog',
	component: DialogContent,
	tags: ['autodocs'],
	parameters: {
		layout: 'centered',
	},
	argTypes: {
		showCloseButton: {
			control: 'boolean',
		},
	},
};

export default meta;

type Story = StoryObj<typeof DialogContent>;

export const Default: Story = {
	render: (args) => (
		<Dialog defaultOpen>
			<DialogContent {...args}>
				<DialogHeader>
					<DialogTitle>Dialog Title Example</DialogTitle>
					<DialogDescription>This is the dialog description.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button>Confirm</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
};

export const DeleteConfirmation: Story = {
	render: (args) => (
		<Dialog defaultOpen>
			<DialogContent {...args}>
				<DialogHeader>
					<DialogTitle>Are you sure you want to do this action?</DialogTitle>
					<DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button variant="destructive">Delete</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
};

export const WithTrigger: Story = {
	render: (args) => (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">Open Dialog</Button>
			</DialogTrigger>
			<DialogContent {...args}>
				<DialogHeader>
					<DialogTitle>Dialog with Trigger</DialogTitle>
					<DialogDescription>
						Click the button above to open this dialog. Click outside or press Escape to close it.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter showCloseButton></DialogFooter>
			</DialogContent>
		</Dialog>
	),
};
