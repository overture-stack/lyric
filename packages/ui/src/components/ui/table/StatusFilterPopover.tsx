import { useState } from 'react';

import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { SUBMISSION_STATUS, SUBMISSION_STATUS_VALUES } from './types';

interface StatusFilterPopoverProps {
	trigger: React.ReactNode;
	open: boolean;
	setStatusPopover: (bool: boolean) => void;
	currentFilter: SUBMISSION_STATUS_VALUES[];
	onApply: (selected: SUBMISSION_STATUS_VALUES[]) => void;
	onReset: () => void;
}

const STATUS_OPTIONS: SUBMISSION_STATUS_VALUES[] = [SUBMISSION_STATUS.IN_PROGRESS, SUBMISSION_STATUS.COMMITED];

export function StatusFilterPopover({
	trigger,
	currentFilter,
	onApply,
	onReset,
	open,
	setStatusPopover,
}: StatusFilterPopoverProps) {
	const [pending, setPending] = useState<SUBMISSION_STATUS_VALUES[]>(currentFilter ?? []);

	function toggle(status: SUBMISSION_STATUS_VALUES) {
		setPending((prev) =>
			prev.includes(status) ? prev.filter((currentStatus) => currentStatus !== status) : [...prev, status],
		);
	}

	return (
		<Popover open={open} onOpenChange={setStatusPopover}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="center" className="bg-white">
				<ul className="space-y-2 mb-3">
					{STATUS_OPTIONS.map((status) => (
						<li key={status}>
							<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
								<Checkbox checked={pending.includes(status)} onCheckedChange={() => toggle(status)} />
								{status}
							</label>
						</li>
					))}
				</ul>

				<div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
					<Button
						variant={'secondary'}
						className="flex-1"
						onClick={() => {
							setPending([]);
							onReset();
						}}
					>
						Reset
					</Button>
					<Button
						variant={'default'}
						className="flex-1 h-10"
						onClick={() => {
							onApply(pending);
						}}
					>
						OK
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
