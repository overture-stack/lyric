import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	buildSubmissionListOptions,
	DEFAULT_SUBMISSION_SORT,
	parseSubmissionSort,
} from '../../../src/utils/submissionListOptions.js';
import { SUBMISSION_STATUS } from '../../../src/utils/types.js';

describe('Submission list options', () => {
	describe('parseSubmissionSort', () => {
		it('parses a field name without a prefix as ascending', () => {
			expect(parseSubmissionSort('organization')).to.eql([{ direction: 'asc', field: 'organization' }]);
		});

		it('parses a field name prefixed with - as descending', () => {
			expect(parseSubmissionSort('-createdAt')).to.eql([{ direction: 'desc', field: 'createdAt' }]);
		});

		it('keeps the order of several comma-separated keys', () => {
			expect(parseSubmissionSort('status,-updatedAt,createdBy')).to.eql([
				{ direction: 'asc', field: 'status' },
				{ direction: 'desc', field: 'updatedAt' },
				{ direction: 'asc', field: 'createdBy' },
			]);
		});

		it('ignores whitespace around each key', () => {
			expect(parseSubmissionSort(' status , -id ')).to.eql([
				{ direction: 'asc', field: 'status' },
				{ direction: 'desc', field: 'id' },
			]);
		});

		it('rejects a field that cannot be sorted by', () => {
			expect(parseSubmissionSort('dictionaryId')).to.be.undefined;
		});

		it('rejects the whole value when only one of its keys is unknown', () => {
			expect(parseSubmissionSort('-createdAt,unknown')).to.be.undefined;
		});

		it('rejects a field name in a different case, since field names are case-sensitive', () => {
			expect(parseSubmissionSort('createdat')).to.be.undefined;
		});

		it('rejects a field named twice, even with opposite directions', () => {
			expect(parseSubmissionSort('createdAt,-createdAt')).to.be.undefined;
		});

		it('rejects an empty key between commas', () => {
			expect(parseSubmissionSort('status,,id')).to.be.undefined;
		});

		it('rejects a bare - with no field name', () => {
			expect(parseSubmissionSort('-')).to.be.undefined;
		});

		it('rejects an empty value', () => {
			expect(parseSubmissionSort('')).to.be.undefined;
		});
	});

	describe('buildSubmissionListOptions', () => {
		it('sorts newest first and applies no filters when no query parameters are given', () => {
			expect(buildSubmissionListOptions({ onlyActive: false })).to.eql({
				filters: { organizations: [], statuses: [], username: undefined },
				sort: DEFAULT_SUBMISSION_SORT,
			});
		});

		it('uses the requested sort instead of the default', () => {
			const { sort } = buildSubmissionListOptions({ onlyActive: false, sort: 'organization,-updatedAt' });

			expect(sort).to.eql([
				{ direction: 'asc', field: 'organization' },
				{ direction: 'desc', field: 'updatedAt' },
			]);
		});

		it('accepts a single organization', () => {
			const { filters } = buildSubmissionListOptions({ onlyActive: false, organization: 'org-a' });

			expect(filters.organizations).to.eql(['org-a']);
		});

		it('accepts several organizations', () => {
			const { filters } = buildSubmissionListOptions({ onlyActive: false, organization: ['org-a', 'org-b'] });

			expect(filters.organizations).to.eql(['org-a', 'org-b']);
		});

		it('accepts statuses in any case', () => {
			const { filters } = buildSubmissionListOptions({ onlyActive: false, status: ['committed', 'Open'] });

			expect(filters.statuses).to.eql([SUBMISSION_STATUS.COMMITTED, SUBMISSION_STATUS.OPEN]);
		});

		it('filters by every active status, and none other, when onlyActive is set', () => {
			const { filters } = buildSubmissionListOptions({ onlyActive: true });

			expect(filters.statuses).to.have.members([
				SUBMISSION_STATUS.OPEN,
				SUBMISSION_STATUS.VALID,
				SUBMISSION_STATUS.INVALID,
				SUBMISSION_STATUS.VALIDATING,
				SUBMISSION_STATUS.COMMITTING,
			]);
			expect(filters.statuses).to.not.include.members([SUBMISSION_STATUS.CLOSED, SUBMISSION_STATUS.COMMITTED]);
		});

		it('passes the username through as the creator filter', () => {
			const { filters } = buildSubmissionListOptions({ onlyActive: false, username: 'user-a' });

			expect(filters.username).to.eq('user-a');
		});

		it('returns a sort list that callers can change without changing the default', () => {
			const { sort } = buildSubmissionListOptions({ onlyActive: false });
			sort.push({ direction: 'asc', field: 'id' });

			expect(DEFAULT_SUBMISSION_SORT).to.eql([{ direction: 'desc', field: 'createdAt' }]);
		});
	});
});
