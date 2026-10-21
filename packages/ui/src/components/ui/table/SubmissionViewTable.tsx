import {
	columnFilteringFeature,
	ColumnFiltersState,
	createColumnHelper,
	rowPaginationFeature,
	rowSortingFeature,
	SortingState,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { cn } from 'cn';
import { ArrowUpDown, Funnel } from 'lucide-react';
import { useState } from 'react';

import { StatusFilterPopover } from './StatusFilterPopover';
import { COLUMN_NAMES, Submission, SUBMISSION_STATUS, SUBMISSION_STATUS_VALUES } from './types';

export const testData: Array<Submission> = [
	{
		submissionId: 'sub-001',
		createdAt: '2026-10-01T09:00:00Z',
		createdBy: 'alice@example.com',
		updatedAt: '2026-10-05T14:30:00Z',
		updatedBy: 'bob@example.com',
		studyName: 'PRISM Cohort A',
		status: SUBMISSION_STATUS.COMMITED,
	},
	{
		submissionId: 'sub-002',
		createdAt: '2026-10-08T11:15:00Z',
		createdBy: 'carol@example.com',
		updatedAt: '2026-10-09T08:45:00Z',
		updatedBy: 'carol@example.com',
		studyName: 'BRCA Follow-up',
		status: SUBMISSION_STATUS.IN_PROGRESS,
	},
	{
		submissionId: 'sub-003',
		createdAt: '2026-10-12T16:00:00Z',
		createdBy: 'dave@example.com',
		updatedAt: '2026-10-15T10:00:00Z',
		updatedBy: 'eve@example.com',
		studyName: 'Lung Cancer Registry',
		status: SUBMISSION_STATUS.COMMITED,
	},
];

export const columnHelper = createColumnHelper<typeof features, Submission>();

const defaultColumns = columnHelper.columns([
	columnHelper.accessor(COLUMN_NAMES.SUBMISSION_ID, {
		header: 'Submission ID',
		enableMultiSort: false,
		enableSorting: false,
		enableColumnFilter: false,
		cell: ({ getValue }) => (
			<a href={`/submissions/${getValue()}`} className="text-[#054A74] hover:underline font-medium">
				{getValue()}
			</a>
		),
	}),
	columnHelper.accessor(COLUMN_NAMES.CREATED_AT, {
		header: 'Created On',
		enableColumnFilter: true,
	}),
	columnHelper.accessor(COLUMN_NAMES.CREATED_BY, {
		header: 'Created By',
		enableColumnFilter: false,
	}),
	columnHelper.accessor(COLUMN_NAMES.UPDATED_AT, {
		header: 'Updated At',
		enableSorting: true,
		enableColumnFilter: false,
	}),
	columnHelper.accessor(COLUMN_NAMES.UPDATED_BY, {
		header: 'Updated By',
		enableColumnFilter: false,
		enableSorting: false,
	}),
	columnHelper.accessor(COLUMN_NAMES.STUDY_NAME, {
		header: 'Study Name',
	}),
	columnHelper.accessor(COLUMN_NAMES.STATUS, {
		header: 'Status',
		enableColumnFilter: true,
	}),
]);

const features = tableFeatures({
	rowSortingFeature,
	columnFilteringFeature,
	rowPaginationFeature,
});

export interface SubmissionViewTableProps {
	initialPageSize?: number;
}

// TODO: Integrate API Layer to fetch data, will use test data for now
export function SubmissionViewTable({ initialPageSize = 20 }: SubmissionViewTableProps) {
	const [columnFilterState, setColumnFilterState] = useState<ColumnFiltersState>([]);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [openStatusPopover, setStatusPopover] = useState<boolean>(false);

	// TODO: API call here, pass manualSorting options to the fetch query
	console.log('Replace----', sorting, columnFilterState);

	const table = useTable({
		features,
		columns: defaultColumns,
		data: testData,
		manualSorting: true,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilterState,
		state: {
			columnFilters: columnFilterState,
		},
		initialState: {
			pagination: { pageIndex: 0, pageSize: initialPageSize },
		},
	});
	const statusColumn = table.getColumn(COLUMN_NAMES.STATUS);

	return (
		<div className="flex flex-col gap-4">
			{/* Table */}
			<div className="overflow-x-auto rounded border border-gray-200">
				<table className='w-full text-sm border-collapse"'>
					<thead className="bg-[#FAFAFA] border-b border-gray-200">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									const canSort = header.column.getCanSort();
									const isStatusCol = header.column.id === COLUMN_NAMES.STATUS;
									const statusFilterState = columnFilterState.find(
										(filterState) => filterState.id === COLUMN_NAMES.STATUS,
									)?.value as SUBMISSION_STATUS_VALUES[]; // TODO: how to type filter and sorting States

									return (
										<th key={header.id} className="pl-2 pr-4 py-3 text-left font-semibold whitespace-nowrap">
											<div className="flex items-center gap-1 w-full">
												{canSort ? (
													<button
														className="flex items-center justify-between w-full gap-0.5 hover:text-gray-900 transition-colors cursor-pointer"
														onClick={header.column.getToggleSortingHandler()}
													>
														<table.FlexRender header={header} />
														<ArrowUpDown size={12} />
													</button>
												) : (
													<table.FlexRender header={header} />
												)}

												{isStatusCol && (
													<StatusFilterPopover
														open={openStatusPopover}
														setStatusPopover={setStatusPopover}
														trigger={
															<button
																aria-label="Filter status"
																className={cn('p-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer')}
																onClick={() => setStatusPopover(true)}
															>
																<Funnel size={12} />
															</button>
														}
														currentFilter={statusFilterState}
														onApply={(selected) => {
															console.log(selected);
															statusColumn?.setFilterValue(selected.length > 0 ? selected : undefined);
															setStatusPopover(false);
														}}
														onReset={() => {
															statusColumn?.setFilterValue(undefined);
															setStatusPopover(false);
														}}
													/>
												)}
											</div>
										</th>
									);
								})}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.map((row) => (
							<tr key={row.id}>
								{row.getAllCells().map((cell) => (
									<td key={cell.id} className="pl-2 py-3 text-black/80">
										<table.FlexRender cell={cell} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
