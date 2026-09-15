import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const pillVariants = cva('inline-flex items-center rounded-md border bg-transparent px-3 py-1 text-xs font-medium', {
	variants: {
		status: {
			default: 'bg-pill-default/25 border-pill-default',
			success: 'bg-pill-success/25 border-pill-success',
			warning: 'bg-pill-warning/25 border-pill-warning',
			error: 'bg-pill-error/25 border-pill-error',
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
	className?: string;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(({ className, status, customStatus, ...props }, ref) => (
	<span ref={ref} className={cn(pillVariants({ status }), className)} {...props}>
		{customStatus ? customStatus : pillStatusLabels[status]}
	</span>
));
Pill.displayName = 'Pill';

export { Pill, pillStatusLabels, pillVariants };
