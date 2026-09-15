import * as React from 'react';

import { Pill, type PillStatus } from '@/components/ui/pill/pill';
import { cn } from '@/lib/utils';

export interface HeaderTextProps extends React.HTMLAttributes<HTMLDivElement> {
	title: string;
	status?: PillStatus;
	customStatus?: string;
	pillStyles?: string;
}

const HeaderText = React.forwardRef<HTMLDivElement, HeaderTextProps>(
	({ className, title, status, customStatus, pillStyles, ...props }, ref) => (
		<div ref={ref} className={cn('flex items-center gap-3', className)} {...props}>
			<h1 className="text-2xl font-bold">{title}</h1>
			{status && <Pill status={status} customStatus={customStatus} className={pillStyles} />}
		</div>
	),
);
HeaderText.displayName = 'HeaderText';

export { HeaderText };
