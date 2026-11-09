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

import { Button } from '../button.js';
import DisplayRowAction from './components/DisplayRowAction.js';
import DisplayRowStatus from './components/DisplayRowStatus.js';
import EntitySelectBox from './components/EntitySelectBox.js';
import { ErrorTable } from './components/ErrorSubTable.js';
import { ApiHandlers, FileActionType, UPLOAD_COLUMN_NAMES, UploadSubmission } from './utils/types.js';

export const columnHelper = createColumnHelper<typeof features, UploadTableRow>();

const features = tableFeatures({
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
});

/**
 *  Function to transform incoming data into a format usable by react table. This table should accomodate new submissions and in-progress submissions.
 *
 * @param dictionary dictionary submissionData is assoicated to
 * @param submissionData Incoming data format. NOTE: Likely to change based of new lyric api changes.
 * @param apiHandlers
 * @returns
 */
const transformDataToTableFormat = (
	dictionary: SchemasDictionary,
	fileActions: FileActionType[],
	apiHandlers: ApiHandlers,
	submissionData?: SubmissionDataSummaryRepositoryRecord,
): UploadTableRow[] => {
	const transformedActions = fileActions.map((currentAction) => ({
		file: currentAction.fileName,
		entity: EntitySelectBox({ dictionary, disabled: false }),
		record: 0, // TODO: need a way to read rows in UI
		status: 'Display Error', // TODO: Need to UI validate
		action: DisplayRowAction(currentAction.fileName, 'VALIDATING', false, apiHandlers),
	}));

	if (submissionData === undefined) {
		return transformedActions;
	}

	const inserts = submissionData.data.inserts;
	if (!inserts) {
		return [];
	}
	const disabled = submissionData.status === 'COMMITTING' || submissionData.status === 'VALIDATING';

	const transformedSubmissionData = Object.entries(inserts).map(([_, summary]) => ({
		file: summary.batchName, // no file info in inserts — mocked
		entity: EntitySelectBox({ dictionary, disabled }),
		record: summary.recordsCount,
		status: DisplayRowStatus(submissionData.status), //TODO: Dynamicly change this action based of commit.action. API should return the error for this row, and display here
		action: DisplayRowAction(summary.batchName, submissionData.status, disabled, apiHandlers),
	}));
	// Logic to map inserts errors to status
	return [...transformedActions, ...transformedSubmissionData];
};

export interface SubmissionViewTableProps {
	dictionary: SchemasDictionary;
	fileActions: FileActionType[];
	handlers: ApiHandlers;
	submissionResponse?: SubmissionDataSummaryRepositoryRecord;
	styles?: {
		headerRowStyles?: string | undefined;
		headerCellStyles?: string | undefined;
		recordRowStyles?: string | undefined;
	};
}

type UploadTableRow = UploadSubmission & { action: string | ReactNode; expanded?: UploadTableRow[] };

/**
 * Table to display the files AFTER it is sent to lyric. Errors are returned from lyric submission
 * @param {SubmissionViewTableProps} props
 * @returns
 */
export function SubmissionTable({
	dictionary,
	fileActions,
	submissionResponse,
	handlers,
	styles,
}: SubmissionViewTableProps) {
	const isNewSubmission = submissionResponse === undefined;
	const tableDisabled =
		!isNewSubmission &&
		submissionResponse &&
		(submissionResponse.status === 'COMMITTING' || submissionResponse.status === 'VALIDATING');

	const defaultColumns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor(UPLOAD_COLUMN_NAMES.FILE, {
					header: 'File',
					cell: ({ row, getValue }) => {
						return (
							<div>
								<div className="flex justify-start items-center ">
									{!isNewSubmission && submissionResponse.status === 'INVALID' && (
										<Button variant="ghost" onClick={row.getToggleExpandedHandler()} style={{ cursor: 'pointer' }}>
											{row.getIsExpanded() ? <ArrowBigDown fill="black" /> : <ArrowBigRight fill="black" />}
										</Button>
									)}
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
				...((submissionResponse && submissionResponse.status !== 'COMMITTED') || isNewSubmission
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
				transformDataToTableFormat(
					dictionary,
					fileActions,
					{
						deleteHandler: handlers.deleteHandler,
						downloadFileHandler: handlers.downloadFileHandler,
						downloadErrorFileHandler: handlers.downloadErrorFileHandler,
						changeEntityHandler: handlers.changeEntityHandler,
					},
					submissionResponse,
				),
			[dictionary, submissionResponse, fileActions],
		),
		getRowCanExpand: () => true,
	});

	return (
		<div className={cn('flex flex-col gap-4', tableDisabled ? 'opacity-55' : '')}>
			{/* Table */}
			<div className="overflow-x-auto rounded">
				<table className="w-full text-sm border-collapse">
					<thead className={cn('bg-sky-900/10', styles?.headerRowStyles)}>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<th
											key={header.id}
											className={cn(
												'pl-2 pr-4 py-3 text-left font-semibold whitespace-nowrap first:border-l last:border-r border-gray-100',
												styles?.headerCellStyles,
											)}
										>
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
									<tr className="odd:bg-white even:bg-gray-100/45">
										{row.getAllCells().map((cell) => (
											<td
												key={cell.id}
												className={cn(
													'pl-2 py-3 text-black/80 border-b border-l border-r border-gray-100',
													styles?.recordRowStyles,
												)}
											>
												<table.FlexRender cell={cell} />
											</td>
										))}
									</tr>
									{submissionResponse && submissionResponse.status === 'INVALID' && row.getIsExpanded() && (
										<tr key={`${row.id}-expanded`}>
											<td colSpan={defaultColumns.length} className="pl-10 pr-10 py-3 bg-gray-50">
												<ErrorTable fileId={row.id} />
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
