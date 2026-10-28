import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { CircleCheck, Download, FileExclamationPoint, Info, Trash } from 'lucide-react';
import { ReactNode } from 'react';

import {
	SchemasDictionary,
	SubmissionDataSummary,
	SubmissionDataSummaryRepositoryRecord,
	SubmissionStatus,
} from '@overture-stack/lyric';

import { Button } from '../button';
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
		status: DisplayStatus(status), //TODO: Dynamicly change this action based of commit.action. API should return the error for this row, and display here
		action: DisplayAction(status), //TODO: Frontend UI validation for OPEN status ->
	}));
}

const DisplayStatus = (status: SubmissionStatus) => {
	switch (status) {
		case 'VALID':
		case 'VALIDATING':
		case 'COMMITTING':
			return (
				<div className="flex gap-2 items-center">
					<CircleCheck size={15} className="text-green-500" />
					<p>{'Ready for validation'}</p>
				</div>
			);
		case 'COMMITTED':
			return (
				<div className="flex gap-2 items-center">
					<Info size={15} className="text-gray-700" />
					<p>{'Commited'}</p>
				</div>
			);
		default:
			return (
				<div>
					<CircleCheck />
				</div>
			);
	}
};

const DisplayAction = (status: SubmissionStatus) => {
	switch (status) {
		case 'VALID':
		case 'VALIDATING':
		case 'COMMITTING':
			return (
				<div className="flex gap-2 items-center">
					<Button variant={'outline'} icon={<Trash />} size={'xs'}>
						{'Remove'}
					</Button>
				</div>
			);
		case 'INVALID':
			return (
				<div className="flex gap-2 items-center">
					<Button variant={'outline'} icon={<Trash />} size={'xs'}>
						{'Remove'}
					</Button>
					<Button variant={'outline'} icon={<FileExclamationPoint />} size={'xs'}>
						{'Error Report'}
					</Button>
					<Button variant={'outline'} icon={<Download />} size={'xs'}>
						{'Download File'}
					</Button>
				</div>
			);
		default:
			return (
				<div>
					<CircleCheck />
				</div>
			);
	}
};

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
			cell: (info) => <>{info.getValue<string>()}</>,
		}),
		...(props.submissionResponse.status !== 'COMMITTED'
			? [
					columnHelper.accessor(UPLOAD_COLUMN_NAMES.ACTION, {
						header: 'Action',
						cell: (info) => <>{info.getValue<string>()}</>,
					}),
				]
			: []),
	]);
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
			status: DisplayStatus(status), //TODO: Dynamicly change this action based of commit.action. API should return the error for this row, and display here
			action: DisplayAction(status), //TODO: Frontend UI validation for OPEN status ->
		}));
	}

	const DisplayStatus = (status: SubmissionStatus) => {
		switch (status) {
			case 'VALID':
			case 'VALIDATING':
			case 'COMMITTING':
				return (
					<div className="flex gap-2 items-center">
						<CircleCheck size={15} className="text-green-500" />
						<p>{'Ready for validation'}</p>
					</div>
				);
			case 'COMMITTED':
				return (
					<div className="flex gap-2 items-center">
						<Info size={15} className="text-gray-700" />
						<p>{'Commited'}</p>
					</div>
				);
			default:
				return (
					<div>
						<CircleCheck />
					</div>
				);
		}
	};

	const DisplayAction = (status: SubmissionStatus) => {
		switch (status) {
			case 'VALID':
			case 'VALIDATING':
			case 'COMMITTING':
				return (
					<div className="flex gap-2 items-center">
						<Button variant={'outline'} icon={<Trash />} size={'xs'}>
							{'Remove'}
						</Button>
					</div>
				);
			case 'INVALID':
				return (
					<div className="flex gap-2 items-center">
						<Button variant={'outline'} icon={<Trash />} size={'xs'}>
							{'Remove'}
						</Button>
						<Button variant={'outline'} icon={<FileExclamationPoint />} size={'xs'}>
							{'Error Report'}
						</Button>
						<Button variant={'outline'} icon={<Download />} size={'xs'}>
							{'Download File'}
						</Button>
					</div>
				);
			default:
				return (
					<div>
						<CircleCheck />
					</div>
				);
		}
	};

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
							<tr key={row.id} className="even:bg-white odd:bg-[#FAFAFA] ">
								{row.getAllCells().map((cell) => (
									<td key={cell.id} className="pl-2 py-3 text-black/80 border border-[#F0F0F0]">
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
