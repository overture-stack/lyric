import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const pillVariants = cva('inline-flex items-center rounded-md border bg-transparent px-3 py-1 text-xs font-medium', {
	variants: {
		status: {
			default: 'border-gray-400 bg-gray-100',
			success: 'border-green-500 bg-green-100',
			warning: 'border-yellow-400 bg-yellow-100',
			error: 'border-red-400 bg-red-100',
		},
	},
});

export type PillStatus = NonNullable<VariantProps<typeof pillVariants>['status']>;

const pillStatusLabels: Record<PillStatus, string> = {
	default: 'Validation in Progress',
	success: 'Ready for Validation',
	warning: 'Action Required',
	error: 'Errors Found',
};

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
	status: PillStatus;
	customStatus?: string;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(({ className, status, customStatus, ...props }, ref) => (
	<span ref={ref} className={cn(pillVariants({ status }), className)} {...props}>
		{customStatus ? customStatus : pillStatusLabels[status]}
	</span>
));
Pill.displayName = 'Pill';

export { Pill, pillStatusLabels, pillVariants };
