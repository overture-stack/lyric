import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { cn } from 'cn';
import { CircleCheck, Trash, TriangleAlert } from 'lucide-react';
import { ReactNode } from 'react';

import { SchemasDictionary } from '@overture-stack/lyric';

import { Button } from '../button';
import EntitySelectBox from './components/EntitySelectBox';
import { UPLOAD_COLUMN_NAMES, UploadSubmission } from './utils/types';

export const columnHelper = createColumnHelper<typeof features, UploadSubmission & { action: string | ReactNode }>();

const features = tableFeatures({});

// TODO: should be frontend metadata of the
export type SubmissionFile = {
	id: string | number;
	filename: string;
	records: number;
	error?: string;
};

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary;
	newSubmission: SubmissionFile[];
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode };

/**
 * Table to display the files BEFORE it is sent to lyric.
 * newSubmission should contain an array of files with the files validatated clientside.
 * @param {SubmissionViewTableProps} props
 * @returns
 */
export function NewSubmissionTable(props: SubmissionViewTableProps) {
	const deleteHandler = (id: number | string) => {
		// TODO: logic to remove file from newSubmission array
		console.log('REMOVE---', id);
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
		columnHelper.accessor(UPLOAD_COLUMN_NAMES.ACTION, {
			header: 'Action',
			cell: (info) => <>{info.getValue<string>()}</>,
		}),
	]);

	function commitToUploadTableRows(files: SubmissionFile[]): UploadTableRow[] {
		return files.map((file) => ({
			file: file.filename, // no file info in inserts — mocked
			entity: EntitySelectBox({ dictionary: props.dictionary }),
			record: file.records,
			status: (
				<div className="flex gap-2 items-center">
					{file.error ? (
						<>
							<TriangleAlert size={15} className="text-red-500" />
							<p>{file.error}</p>
						</>
					) : (
						<>
							<CircleCheck size={15} className="text-green-500" />
							<p>Ready for validation</p>
						</>
					)}
				</div>
			),
			action: (
				<div className="flex gap-2 items-center">
					<Button
						className="cursor-pointer"
						onClick={() => deleteHandler(file.id)}
						variant={'outline'}
						icon={<Trash />}
						size={'xs'}
					>
						{'Remove'}
					</Button>
				</div>
			),
		}));
	}

	const table = useTable({
		features,
		columns: defaultColumns,
		data: commitToUploadTableRows(props.newSubmission),
	});

	return (
		<div className={cn('flex flex-col gap-4')}>
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
