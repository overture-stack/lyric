import { useEffect, useRef, useState } from 'react';

import { SUBMISSION_STATUS, SUBMISSION_STATUS_VALUES } from './types';

interface StatusFilterPopoverProps {
	currentFilter: SUBMISSION_STATUS_VALUES[] | undefined;
	onApply: (selected: SUBMISSION_STATUS_VALUES[]) => void;
	onReset: () => void;
	onClose: () => void;
}
const STATUS_OPTIONS: SUBMISSION_STATUS_VALUES[] = [SUBMISSION_STATUS.IN_PROGRESS, SUBMISSION_STATUS.COMMITED];

export function StatusFilterPopover({ currentFilter, onApply, onReset, onClose }: StatusFilterPopoverProps) {
	const [pending, setPending] = useState<SUBMISSION_STATUS_VALUES[]>(currentFilter ?? []);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleOutsideClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [onClose]);

	function toggle(status: SUBMISSION_STATUS_VALUES) {
		setPending((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
	}

	return (
		<div
			ref={ref}
			className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded shadow-lg p-3 min-w-[180px]"
			role="dialog"
			aria-label="Filter by Status"
		>
			<ul className="space-y-2 mb-3">
				{STATUS_OPTIONS.map((status) => (
					<li key={status}>
						<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
							<input
								type="checkbox"
								className="rounded border-gray-300"
								checked={pending.includes(status)}
								onChange={() => toggle(status)}
							/>
							{status}
						</label>
					</li>
				))}
			</ul>

			<div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
				<button
					className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
					onClick={() => {
						setPending([]);
						onReset();
					}}
				>
					Reset
				</button>
				<button
					className="text-sm px-3 py-1 rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
					onClick={() => {
						onApply(pending);
						onClose();
					}}
				>
					OK
				</button>
			</div>
		</div>
	);
}
