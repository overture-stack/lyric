import {
	createColumnHelper,
	createExpandedRowModel,
	rowExpandingFeature,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { cn } from 'cn';
import { ArrowBigDown, ArrowBigRight } from 'lucide-react';
import { Fragment, ReactNode, useMemo } from 'react';

import { SchemasDictionary, SubmissionDataSummaryRepositoryRecord } from '@overture-stack/lyric';

import { Button } from '../button';
import DisplayRowAction from './components/DisplayRowAction';
import DisplayRowStatus from './components/DisplayRowStatus';
import EntitySelectBox from './components/EntitySelectBox';
import { ApiHandlers, UPLOAD_COLUMN_NAMES, UploadSubmission } from './utils/types';

export const columnHelper = createColumnHelper<typeof features, UploadTableRow>();

const features = tableFeatures({
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
});

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary;
	submissionResponse: SubmissionDataSummaryRepositoryRecord;
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode; expanded?: UploadTableRow[] };

/**
 *  Function to transform incoming data into a format usable by react table.
 * @param dictionary dictionary submissionData is assoicated to
 * @param submissionData Incoming data format. NOTE: Likely to change based of new lyric api changes.
 * @param apiHandlers
 * @returns
 */
const transformSubmissionData = (
	dictionary: SchemasDictionary,
	submissionData: SubmissionDataSummaryRepositoryRecord,
	apiHandlers: ApiHandlers,
): UploadTableRow[] => {
	const inserts = submissionData.data.inserts;
	if (!inserts) {
		return [];
	}
	const disabled = submissionData.status === 'COMMITTING' || submissionData.status === 'VALIDATING';

	// Logic to map inserts errors to status
	return Object.entries(inserts).map(([_, summary]) => ({
		file: summary.batchName, // no file info in inserts — mocked
		entity: EntitySelectBox({ dictionary, disabled }),
		record: summary.recordsCount,
		status: DisplayRowStatus(submissionData.status), //TODO: Dynamicly change this action based of commit.action. API should return the error for this row, and display here
		action: DisplayRowAction(summary.batchName, submissionData.status, disabled, apiHandlers),
	}));
};

/**
 * Table to display the files AFTER it is sent to lyric. Errors are returned from lyric submission
 * @param {SubmissionViewTableProps} props
 * @returns
 */
export function UploadedSubmissionTable(props: SubmissionViewTableProps) {
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

	const defaultColumns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor(UPLOAD_COLUMN_NAMES.FILE, {
					header: 'File',
					cell: ({ row, getValue }) => {
						return (
							<div
								style={{
									paddingLeft: `${row.depth * 2}rem`,
								}}
							>
								<div className="flex justify-start items-center ">
									<Button variant="ghost" onClick={row.getToggleExpandedHandler()} style={{ cursor: 'pointer' }}>
										{row.getIsExpanded() ? <ArrowBigDown fill="black" /> : <ArrowBigRight fill="black" />}
									</Button>
									{getValue<boolean>()}
								</div>
							</div>
						);
					},
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
			]),
		[],
	);

	const table = useTable({
		features,
		columns: defaultColumns,
		data: useMemo(
			() =>
				transformSubmissionData(props.dictionary, props.submissionResponse, {
					deleteHandler,
					downloadFileHandler,
					downloadErrorFileHandler,
				}),
			[props.dictionary, props.submissionResponse],
		),
		getRowCanExpand: () => true, // Add your logic to determine if a row can be expanded. True means all rows include expanded data
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
						{table.getRowModel().rows.map((row) => {
							return (
								<Fragment key={row.id}>
									<tr className="even:bg-white odd:bg-[#FAFAFA] ">
										{row.getAllCells().map((cell) => (
											<td key={cell.id} className="pl-2 py-3 text-black/80 border border-[#F0F0F0]">
												<table.FlexRender cell={cell} />
											</td>
										))}
									</tr>
									{row.getIsExpanded() && (
										<tr key={`${row.id}-expanded`}>
											<td colSpan={defaultColumns.length} className="pl-4 py-3 bg-gray-50">
												<div>Display error summary table</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
