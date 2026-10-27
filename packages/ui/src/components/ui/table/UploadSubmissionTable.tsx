import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ReactNode } from 'react';

import {
	SchemasDictionary,
	SubmissionDataSummary,
	SubmissionDataSummaryRepositoryRecord,
	SubmissionStatus,
} from '@overture-stack/lyric';

import { UPLOAD_COLUMN_NAMES, UploadSubmission } from './utils/types';

export const columnHelper = createColumnHelper<typeof features, UploadSubmission & { action: string | ReactNode }>();

const features = tableFeatures({});

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary; // Need to use this to grab the appropriate entities per dictionary
	submissionResponse: SubmissionDataSummaryRepositoryRecord;
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode };

function commitToUploadTableRows(commit: SubmissionDataSummary, status: SubmissionStatus): UploadTableRow[] {
	const inserts = commit.inserts;
	if (!inserts) {
		return [];
	}

	// Logic to map inserts errors to status
	return Object.entries(inserts).map(([_, summary]) => ({
		file: `${summary.batchName}.tsv`, // no file info in inserts — mocked
		entity: summary.batchName,
		record: summary.recordsCount,
		status, //TODO: Frontend UI validation for OPEN status ->
		action: 'View', // Dynamicly change this action based of commit.action
	}));
}

export function UploadSubmissionViewTable(props: SubmissionViewTableProps) {
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
		...(props.submissionResponse.status !== 'VALID'
			? [
					columnHelper.accessor(UPLOAD_COLUMN_NAMES.ACTION, {
						header: 'Action',
						cell: (info) => <i>{info.getValue<string>()}</i>,
					}),
				]
			: []),
	]);

	const table = useTable({
		features,
		columns: defaultColumns,
		data: commitToUploadTableRows(props.submissionResponse.data, props.submissionResponse.status),
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
