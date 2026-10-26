import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ReactNode } from 'react';

import { SchemasDictionary } from '@overture-stack/lyric';

import { Commit, UPLOAD_COLUMN_NAMES, UploadSubmission } from './types';

export const columnHelper = createColumnHelper<typeof features, UploadSubmission & { action: string | ReactNode }>();

const defaultColumns = columnHelper.columns([
	columnHelper.accessor(UPLOAD_COLUMN_NAMES.FILE, {
		header: 'File',
	}),
	columnHelper.accessor(UPLOAD_COLUMN_NAMES.ENTITY, {
		header: 'Entity',
	}),
	columnHelper.accessor(UPLOAD_COLUMN_NAMES.RECORD, {
		header: 'Record',
	}),
	columnHelper.accessor(UPLOAD_COLUMN_NAMES.STATUS, {
		header: 'Status',
	}),
	columnHelper.accessor(UPLOAD_COLUMN_NAMES.ACTION, {
		header: 'Action',
	}),
]);

const features = tableFeatures({});

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary;
	data: Commit;
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode };

function commitToUploadTableRows(commit: Commit): UploadTableRow[] {
	const inserts = commit.data.inserts;
	if (!inserts) {
		return [];
	}

	// Logic to map inserts errors to status
	return Object.entries(inserts).map(([key, summary]) => ({
		file: `${summary.batchName}.tsv`, // no file info in inserts — mocked
		entity: summary.batchName,
		record: summary.recordsCount,
		status: commit.status, // Frontend UI validation for this ->
		action: 'View', // Dynamicly change this action based of commit.action
	}));
}

export function UploadSubmissionViewTable(props: SubmissionViewTableProps) {
	const table = useTable({
		features,
		columns: defaultColumns,
		data: commitToUploadTableRows(props.data),
	});

	return (
		<div className="flex flex-col gap-4">
			{/* Table */}
			<div className="overflow-x-auto rounded border border-gray-200">
				<table className='w-full text-sm border-collapse"'>
					<thead className="bg-[#054A741A] border-b border-gray-200">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<th key={header.id} className="pl-2 pr-4 py-3 text-left font-semibold whitespace-nowrap">
											<div className="flex items-center gap-1 w-full">
												<table.FlexRender header={header} />
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
