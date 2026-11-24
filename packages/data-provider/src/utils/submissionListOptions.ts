import { asArray } from './formatUtils.js';
import { inProcessSubmissionStatus, openSubmissionStatus } from './submissionUtils.js';
import {
	type SortKey,
	SUBMISSION_SORT_FIELD,
	SUBMISSION_STATUS,
	type SubmissionListOptions,
	type SubmissionSortField,
	type SubmissionStatus,
} from './types.js';

/**
 * Sort order used when a request does not ask for one: newest Submissions first.
 */
export const DEFAULT_SUBMISSION_SORT: readonly SortKey<SubmissionSortField>[] = Object.freeze([
	Object.freeze({ direction: 'desc', field: 'createdAt' } as const),
]);

const SORT_KEY_SEPARATOR = ',';
const DESCENDING_PREFIX = '-';

const submissionStatuses: readonly string[] = Object.values(SUBMISSION_STATUS);

/**
 * Checks whether a value is a Submission status, matching case exactly.
 */
export const isSubmissionStatus = (value: string): value is SubmissionStatus => submissionStatuses.includes(value);

const parseSortKey = (key: string): SortKey<SubmissionSortField> | undefined => {
	const trimmedKey = key.trim();
	const isDescending = trimmedKey.startsWith(DESCENDING_PREFIX);
	const fieldName = SUBMISSION_SORT_FIELD.safeParse(
		isDescending ? trimmedKey.slice(DESCENDING_PREFIX.length) : trimmedKey,
	);
	return fieldName.success ? { direction: isDescending ? 'desc' : 'asc', field: fieldName.data } : undefined;
};

/**
 * Parses the `sort` query parameter: comma-separated field names from `SUBMISSION_SORT_FIELD`, each sorted ascending
 * unless prefixed with `-`. Field names are case-sensitive.
 * @param value The raw query parameter value
 * @returns The sort keys in the requested order, or `undefined` when any key is empty or unknown, or a field is named
 * more than once
 */
export const parseSubmissionSort = (value: string): SortKey<SubmissionSortField>[] | undefined => {
	const keys = value.split(SORT_KEY_SEPARATOR).map(parseSortKey);
	if (keys.every((key): key is SortKey<SubmissionSortField> => key !== undefined)) {
		const fieldNames = new Set(keys.map((key) => key.field));
		return fieldNames.size === keys.length ? keys : undefined;
	}
	return undefined;
};

/**
 * Builds the options for listing the Submissions of a category from the query parameters of the list endpoint.
 * Expects values that already passed `submissionsByCategoryRequestSchema`: an invalid `sort` falls back to
 * `DEFAULT_SUBMISSION_SORT`, unknown statuses are dropped, and `onlyActive` replaces any `status` values.
 * @param query The list endpoint's query parameters, with `onlyActive` already converted to a boolean
 * @returns Filters and sort order to pass to the Submission service
 */
export const buildSubmissionListOptions = ({
	onlyActive,
	organization,
	sort,
	status,
	username,
}: {
	onlyActive: boolean;
	organization?: string | string[];
	sort?: string;
	status?: string | string[];
	username?: string;
}): SubmissionListOptions => ({
	filters: {
		organizations: asArray(organization ?? []),
		statuses: onlyActive
			? [...openSubmissionStatus, ...inProcessSubmissionStatus]
			: asArray(status ?? [])
					.map((value) => value.toUpperCase())
					.filter(isSubmissionStatus),
		username,
	},
	sort: (sort ? parseSubmissionSort(sort) : undefined) ?? [...DEFAULT_SUBMISSION_SORT],
});
