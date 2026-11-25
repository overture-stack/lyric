import type { DataRecord, DataRecordValue, Schema } from '@overture-stack/lectern-client';
import type {
	SubmissionData,
	SubmissionDeleteData,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../repository/submissionRecordsRepository.js';
import { columnSeparatorValue, type SupportedFileExtension } from './fileUtils.js';

// Lectern splits array values on this delimiter when a field doesn't define its own
const DEFAULT_ARRAY_DELIMITER = ',';

const SYSTEM_ID_HEADER = 'systemId';

// Names the action type of a file without records
const EMPTY_FILE_ACTION_TYPE = 'empty';

/**
 * The data of a Submission File to download: the column headers, and one row of values per record, in header order.
 * `actionType` is the lowercase action type of the file's records, joined with `_` in the unexpected case they differ,
 * or `empty` when the file has no records.
 */
export type SubmissionFileData = {
	submissionId: number;
	fileId: number;
	entityName: string;
	actionType: string;
	headers: string[];
	rows: string[][];
};

/**
 * Gets the name of a Submission File to download, in the format
 * `{submissionId}-{actionType}-{entityName}-file-{fileId}.{fileType}`.
 * The values are used as they are, without escaping or removing any characters.
 */
export const getDownloadFileName = (
	{
		submissionId,
		actionType,
		entityName,
		fileId,
	}: Pick<SubmissionFileData, 'submissionId' | 'actionType' | 'entityName' | 'fileId'>,
	fileType: SupportedFileExtension,
): string => `${submissionId}-${actionType}-${entityName}-file-${fileId}.${fileType}`;

/**
 * Gets the lowercase action type of a file's records, joining differing types with `_`, or `empty` when there are no
 * records.
 */
const getFileActionType = (records: SubmissionRecordWithEntityName[]): string => {
	const actionTypes = [...new Set(records.map((record) => record.actionType.toLowerCase()))];
	// Each file is saved with a single action type, so differing types are joined rather than rejected
	return actionTypes.length ? actionTypes.join('_') : EMPTY_FILE_ACTION_TYPE;
};

/**
 * Converts a record value to text. Array values are joined with the field's delimiter.
 */
const toText = (value: DataRecordValue | null, arrayDelimiter: string = DEFAULT_ARRAY_DELIMITER): string => {
	if (value === undefined || value === null) {
		return '';
	}
	return Array.isArray(value) ? value.join(arrayDelimiter) : String(value);
};

/**
 * Formats a single value for a separated value file. Values containing the column separator, a double quote, or a
 * line break are wrapped in double quotes, with each double quote inside doubled, so they parse back to the same value.
 * Other values are returned unchanged.
 */
export const formatSeparatedValue = (text: string, separator: string): string => {
	if (text.includes(separator) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
};

/**
 * Checks whether Submission Record data has the shape of an UPDATE: a `systemId`, with its `old` and `new` values.
 * Only the shape of the data is checked, not the record's action type.
 */
export const isSubmissionUpdateData = (data: SubmissionData): data is SubmissionUpdateData =>
	'systemId' in data && 'new' in data && 'old' in data;

const isSubmissionDeleteData = (data: SubmissionData): data is SubmissionDeleteData =>
	'systemId' in data && 'data' in data && 'isValid' in data;

/**
 * Gets the row data of a Submission Record, with its system ID for UPDATE and DELETE records.
 * An UPDATE row holds its new values over the record's current Submitted Data, or only its new values when that
 * Submitted Data is not found.
 */
const getRecordRowData = (
	record: SubmissionRecordWithEntityName,
	submittedDataBySystemId: Map<string, DataRecord>,
): { data: DataRecord; systemId?: string } => {
	const { data } = record;
	if (isSubmissionUpdateData(data)) {
		// An UPDATE record only stores the fields it changes, so the unchanged fields come from the Submitted Data
		const currentData = submittedDataBySystemId.get(data.systemId) ?? {};
		return { data: { ...currentData, ...data.new }, systemId: data.systemId };
	}
	if (isSubmissionDeleteData(data)) {
		return { data: data.data, systemId: data.systemId };
	}
	return { data };
};

/**
 * Orders records by the line they were submitted on. Records without a line number, such as those staged by the
 * system, follow in the order they were added to the Submission.
 */
const compareByLineNumber = (a: SubmissionRecordWithEntityName, b: SubmissionRecordWithEntityName): number => {
	if (a.lineNumber === b.lineNumber) {
		return a.id - b.id;
	}
	if (a.lineNumber === null) {
		return 1;
	}
	if (b.lineNumber === null) {
		return -1;
	}
	return a.lineNumber - b.lineNumber;
};

/**
 * Builds the action type, headers, and rows of a Submission File from its records.
 *
 * - `actionType` is the lowercase action type of the records, joined with `_` if they differ, or `empty` when there
 *   are no records.
 * - `headers` are the schema's field names. When any record is an UPDATE or DELETE, a `systemId` column is added at
 *   the end, empty for INSERT records.
 * - `rows` hold one record each, ordered by line number. Records without a line number come last, in the order they
 *   were added to the Submission.
 * - An UPDATE row holds its new values over the current Submitted Data, or only its new values when the system ID is
 *   not in `submittedDataBySystemId`.
 * - Array values are joined with the field's delimiter, or `,` when the field has none. Missing and `null` values are
 *   empty strings. Values are not quoted.
 *
 * @param params.schema The schema of the file's entity, which sets the columns and their order
 * @param params.submittedDataBySystemId The current Submitted Data of the file's UPDATE records, by system ID
 */
export const buildSubmissionFileData = ({
	schema,
	records,
	submittedDataBySystemId,
}: {
	schema: Schema;
	records: SubmissionRecordWithEntityName[];
	submittedDataBySystemId: Map<string, DataRecord>;
}): Pick<SubmissionFileData, 'actionType' | 'headers' | 'rows'> => {
	const hasSystemIdColumn = records.some((record) => record.actionType !== 'INSERT');

	const headers = schema.fields.map((field) => field.name);
	if (hasSystemIdColumn) {
		headers.push(SYSTEM_ID_HEADER);
	}

	const rows = [...records].sort(compareByLineNumber).map((record) => {
		const { data, systemId } = getRecordRowData(record, submittedDataBySystemId);
		const values = schema.fields.map((field) => toText(data[field.name], field.delimiter));
		if (hasSystemIdColumn) {
			values.push(toText(systemId));
		}
		return values;
	});

	return { actionType: getFileActionType(records), headers, rows };
};

/**
 * Formats a Submission File's headers and rows as the content of a `.csv` or `.tsv` file.
 *
 * - The first line holds the headers, and each following line is one row. With no rows, only the headers are written.
 * - Values are separated by `,` for `csv` and by a tab for `tsv`, and quoted when they contain the separator, a double
 *   quote, or a line break.
 * - Every line ends with `\n`, including the last.
 */
export const formatSubmissionFileContent = (
	{ headers, rows }: Pick<SubmissionFileData, 'headers' | 'rows'>,
	fileType: SupportedFileExtension,
): string => {
	const separator = columnSeparatorValue[fileType];
	return (
		[headers, ...rows]
			.map((line) => line.map((value) => formatSeparatedValue(value, separator)).join(separator))
			.join('\n') + '\n'
	);
};
