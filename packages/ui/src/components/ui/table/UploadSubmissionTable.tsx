import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { cn } from 'cn';
import { CircleCheck, Download, FileExclamationPoint, Info, Trash, TriangleAlert } from 'lucide-react';
import { ReactNode } from 'react';

import {
	SchemasDictionary,
	SubmissionDataSummary,
	SubmissionDataSummaryRepositoryRecord,
	SubmissionStatus,
} from '@overture-stack/lyric';

import { Button } from '../button';
import EntitySelectBox from './components/EntitySelectBox';
import { UPLOAD_COLUMN_NAMES, UploadSubmission } from './utils/types';

export const columnHelper = createColumnHelper<typeof features, UploadSubmission & { action: string | ReactNode }>();

const features = tableFeatures({});

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary; // Need to use this to grab the appropriate entities per dictionary
	submissionResponse: SubmissionDataSummaryRepositoryRecord;
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode };

/**
 * Table to display the files AFTER it is sent to lyric. Errors are returned from lyric submission
 * @param {SubmissionViewTableProps} props
 * @returns
 */
export function UploadSubmissionTable(props: SubmissionViewTableProps) {
	const tableDisabled =
		props.submissionResponse.status === 'COMMITTING' || props.submissionResponse.status === 'VALIDATING';

	const deleteHandler = (id: number | string) => {
		// TODO: put request to remove selected field
		console.log('DELETE---', id);
	};

	const downloadFileHandler = (id: number | string) => {
		// TODO: endpoint to download by filename
		console.log('DOWNLOAD---', id);
	};
	const downloadErrorFileHandler = (id: number | string) => {
		// TODO: endpoint to download error for specific by file
		console.log('DOWNLOAD-ERROR---', id);
	};

	const defaultColumns = columnHelper.columns([
		columnHelper.accessor(UPLOAD_COLUMN_NAMES.FILE, {
			header: 'File',
		}),
		columnHelper.accessor(UPLOAD_COLUMN_NAMES.ENTITY, {
			header: 'Entity',
			cell: (info) => <>{info.getValue<string>()}</>,
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
			file: summary.batchName, // no file info in inserts — mocked
			entity: EntitySelectBox({ dictionary: props.dictionary, disabled: tableDisabled }),
			record: summary.recordsCount,
			status: DisplayStatus(status), //TODO: Dynamicly change this action based of commit.action. API should return the error for this row, and display here
			action: DisplayAction(summary.batchName, status), //TODO: Frontend UI validation for OPEN status ->
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
						<Info size={15} className="text-gray-[#3D7CA4]" />
						<p>{'Commited'}</p>
					</div>
				);
			case 'INVALID': // TEXT NEEDS TO BE DYNAMIC
				return (
					<div className="flex gap-2 items-center">
						<TriangleAlert size={15} className="text-red-500" />
						<p>{'ERROR'}</p>
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

	const DisplayAction = (id: number | string, status: SubmissionStatus) => {
		switch (status) {
			case 'VALID':
			case 'VALIDATING':
			case 'COMMITTING':
				return (
					<div className="flex gap-2 items-center">
						<Button
							className="cursor-pointer"
							onClick={() => deleteHandler(id)}
							disabled={tableDisabled}
							variant={'outline'}
							icon={<Trash />}
							size={'xs'}
						>
							{'Remove'}
						</Button>
					</div>
				);
			case 'INVALID':
				return (
					<div className="flex gap-2 items-center">
						<Button
							className="cursor-pointer"
							onClick={() => deleteHandler(id)}
							disabled={tableDisabled}
							variant={'outline'}
							icon={<Trash />}
							size={'xs'}
						>
							{'Remove'}
						</Button>
						<Button
							className="cursor-pointer"
							onClick={() => downloadErrorFileHandler(id)}
							disabled={tableDisabled}
							variant={'outline'}
							icon={<FileExclamationPoint />}
							size={'xs'}
						>
							{'Error Report'}
						</Button>
						<Button
							className="cursor-pointer"
							onClick={() => downloadFileHandler(id)}
							disabled={tableDisabled}
							variant={'outline'}
							icon={<Download />}
							size={'xs'}
						>
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
		<div className={cn('flex flex-col gap-4', tableDisabled ? 'opacity-55' : '')}>
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
