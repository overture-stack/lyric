import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const headerTextBadgeVariants = cva(
	'inline-flex items-center rounded-full border bg-transparent px-3 py-1 text-xs font-medium',
	{
		variants: {
			status: {
				validation_in_progress: 'border-gray-400 text-gray-600',
				ready_for_validation: 'border-green-500 text-green-700',
				action_required: 'border-yellow-400 text-yellow-700',
			},
		},
	},
);

export interface HeaderTextProps extends React.HTMLAttributes<HTMLDivElement> {
	title: string;
	status?: VariantProps<typeof headerTextBadgeVariants>['status'];
}

const statusLabels: Record<NonNullable<HeaderTextProps['status']>, string> = {
	validation_in_progress: 'Validation in Progress',
	ready_for_validation: 'Ready for Validation',
	action_required: 'Action Required',
};

const HeaderText = React.forwardRef<HTMLDivElement, HeaderTextProps>(({ className, title, status, ...props }, ref) => {
	return (
		<div ref={ref} className={cn('flex items-center gap-3', className)} {...props}>
			<h1 className="text-2xl font-bold">{title}</h1>
			{status && <span className={headerTextBadgeVariants({ status })}>{statusLabels[status]}</span>}
		</div>
	);
});
HeaderText.displayName = 'HeaderText';

export { HeaderText, headerTextBadgeVariants };
