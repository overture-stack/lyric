import {
	ColumnDef,
	columnFilteringFeature,
	createColumnHelper,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	RowData,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { cn } from 'cn';
import { ArrowUpDown, Funnel } from 'lucide-react';

import { Submission } from './types';

export const columnHelper = createColumnHelper<typeof features, Submission>();

const features = tableFeatures({
	rowSortingFeature,
	columnFilteringFeature,
	rowPaginationFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
});

export interface DisplayTableProps<TData extends RowData> {
	columns: Array<ColumnDef<typeof features, TData>>;
	data?: TData[];
	initialPageSize?: number;
}

export function DisplayTable<TData extends RowData>({
	data = [],
	columns,
	initialPageSize = 20,
}: DisplayTableProps<TData>) {
	const table = useTable({
		features,
		columns,
		data,
		initialState: {
			pagination: { pageIndex: 0, pageSize: initialPageSize },
		},
	});

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
									const canFilter = header.column.getCanFilter();

									return (
										<th key={header.id} className="pl-2 pr-4 py-3 text-left font-semibold whitespace-nowrap">
											<div className="flex items-center gap-1 w-full">
												{/* Sort trigger */}
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

												{/* Filter trigger */}
												{canFilter && (
													<div className="relative ml-0.5 ">
														<button
															aria-label="Filter status"
															className={cn('p-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer')}
														>
															<Funnel size={12} />
														</button>
													</div>
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
									<td key={cell.id} className="pl-2">
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
