import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { useMemo } from 'react';

import { errorSummaryMock } from '../utils/mock';

type ErrorRow = {
	field: string;
	errorType: string;
	details: string;
	errorValue: string;
	rowsAffected: number;
};

const features = tableFeatures({});

const columnHelper = createColumnHelper<typeof features, ErrorRow>();

const defaultColumns = columnHelper.columns([
	columnHelper.accessor('field', {
		header: 'Field',
		cell: (info) => <span className="underline cursor-pointer text-black">{info.getValue<string>()}</span>,
	}),
	columnHelper.accessor('errorType', {
		header: 'Error Type',
		cell: (info) => (
			<span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-600 border border-red-200 whitespace-nowrap">
				{info.getValue<string>()}
			</span>
		),
	}),
	columnHelper.accessor('details', {
		header: 'Details',
	}),
	columnHelper.accessor('errorValue', {
		header: 'Error Value',
	}),
	columnHelper.accessor('rowsAffected', {
		header: 'Rows Affected',
		cell: (info) => {
			const count = info.getValue<number>();
			return <>{count === 1 ? '1 row' : `${count} rows`}</>;
		},
	}),
]);

export function ErrorTable({ fileId }: { fileId: string | number }) {
	console.log('FETCH FROM-', fileId);
	const data = useMemo(() => errorSummaryMock, [errorSummaryMock]); // TODO: remove this with react-query, use file id to fetch from db and use proper caching

	const table = useTable({
		features,
		columns: defaultColumns,
		data,
	});

	return (
		<div className="overflow-x-auto rounded border border-gray-200">
			<table className="w-full text-sm border-collapse">
				<thead className="bg-[#054A741A] border-b border-gray-200 pr-2">
					{table.getHeaderGroups().map((headerGroup) => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<th key={header.id} className="pl-4 pr-6 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
									<table.FlexRender header={header} />
								</th>
							))}
						</tr>
					))}
				</thead>
				<tbody>
					{table.getRowModel().rows.map((row) => (
						<tr key={row.id} className="border-b border-gray-100 last:border-0">
							{row.getAllCells().map((cell) => (
								<td key={cell.id} className="pl-4 pr-6 py-3 text-gray-800">
									<table.FlexRender cell={cell} />
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
