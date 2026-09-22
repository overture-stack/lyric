import type { Meta, StoryObj } from '@storybook/react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from './alert';

const meta: Meta<typeof Alert> = {
	title: 'Components/Alert',
	component: Alert,
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'destructive'],
		},
	},
	args: {
		children: 'Alert',
	},
};

export default meta;

type Story = StoryObj<typeof Alert>;

// ─── Notification (rounded border, contained) ───────────────────────────────

export const GeneralInformationNotification: Story = {
	render: () => (
		<Alert className=" border-amber-200 bg-amber-50 ">
			<Info />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const WarningNotification: Story = {
	render: () => (
		<Alert className="bg-yellow-50 border-yellow-200 text-yellow-900">
			<AlertCircle className="text-yellow-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const ErrorNotification: Story = {
	render: () => (
		<Alert className="bg-red-50 border-red-200 text-red-900">
			<XCircle className="text-red-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const SuccessNotification: Story = {
	render: () => (
		<Alert className="bg-green-50 border-green-200 text-green-900">
			<CheckCircle2 className="text-green-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

// ─── Banner (full-width, no rounded corners) ─────────────────────────────────

export const GeneralInformationBanner: Story = {
	render: () => (
		<Alert className="rounded-none bg-blue-50 border-x-0 border-blue-200 text-blue-900">
			<Info className="text-blue-700" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const WarningBanner: Story = {
	render: () => (
		<Alert className="rounded-none bg-yellow-50 border-x-0 border-yellow-200 text-yellow-900">
			<AlertCircle className="text-yellow-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const ErrorBanner: Story = {
	render: () => (
		<Alert className="rounded-none bg-red-50 border-x-0 border-red-200 text-red-900">
			<XCircle className="text-red-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};

export const SuccessBanner: Story = {
	render: () => (
		<Alert className="rounded-none bg-green-50 border-x-0 border-green-200 text-green-900">
			<CheckCircle2 className="text-green-500" />
			<AlertTitle>Alert title</AlertTitle>
			<AlertDescription>Example text if more description is needed.</AlertDescription>
		</Alert>
	),
};
