import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	submissionFileDeleteRequestSchema,
	submissionsByCategoryRequestSchema,
	uploadSubmissionRequestSchema,
} from '../../../src/utils/schemas.js';

const bodySchema = uploadSubmissionRequestSchema.body;
const querySchema = uploadSubmissionRequestSchema.query;

describe('uploadSubmissionRequestSchema body', () => {
	/**
	 * The fileEntityMap of the uploadFiles endpoint can come formatted in multiple ways, and it is
	 * reasonable to parse all of them. We're adding tests for this schema in specific to make sure
	 * the custom preprocessor on the schema parses all cases correctly.
	 */

	it('should return undefined when body is missing', () => {
		const result = bodySchema?.safeParse(undefined);

		expect(result).to.deep.equal({ success: true, data: undefined });
	});

	it('should parse a stringified array with JSON objects', () => {
		const input = '[{"filename":"a.tsv","entity":"donor"},{"filename":"b.tsv","entity":"sample"}]';

		const result = bodySchema?.safeParse(input);

		expect(result).to.deep.equal({
			success: true,
			data: [
				{ filename: 'a.tsv', entity: 'donor' },
				{ filename: 'b.tsv', entity: 'sample' },
			],
		});
	});

	it('should parse a stringified single JSON object into a single-element array', () => {
		const input = JSON.stringify({ filename: 'a.tsv', entity: 'donor' });

		const result = bodySchema?.safeParse(input);

		expect(result).to.deep.equal({
			success: true,
			data: [{ filename: 'a.tsv', entity: 'donor' }],
		});
	});

	it('should return undefined when body is not valid JSON', () => {
		const result = bodySchema?.safeParse('not valid json {[}');

		expect(result).to.deep.equal({ success: true, data: undefined });
	});

	it('should parse a stringified array of stringified JSON objects', () => {
		const input = JSON.stringify([
			JSON.stringify({ filename: 'a.tsv', entity: 'donor' }),
			JSON.stringify({ filename: 'b.tsv', entity: 'sample' }),
		]);

		const result = bodySchema?.safeParse(input);

		expect(result).to.deep.equal({
			success: true,
			data: [
				{ filename: 'a.tsv', entity: 'donor' },
				{ filename: 'b.tsv', entity: 'sample' },
			],
		});
	});
});

describe('uploadSubmissionRequestSchema query', () => {
	it('accepts a valid organization with no sync param', () => {
		const result = querySchema?.safeParse({ organization: 'test-org' });
		expect(result?.success).to.be.true;
	});

	it('accepts sync=true', () => {
		const result = querySchema?.safeParse({ organization: 'test-org', sync: 'true' });
		expect(result?.success).to.be.true;
	});

	it('accepts sync=false', () => {
		const result = querySchema?.safeParse({ organization: 'test-org', sync: 'false' });
		expect(result?.success).to.be.true;
	});

	it('rejects sync with a value outside the allowed enum', () => {
		const result = querySchema?.safeParse({ organization: 'test-org', sync: 'yes' });
		expect(result?.success).to.be.false;
	});
});

describe('submissionFileDeleteRequestSchema', () => {
	const fileQuerySchema = submissionFileDeleteRequestSchema.query;
	const pathParamsSchema = submissionFileDeleteRequestSchema.pathParams;

	it('accepts a positive integer file ID and submission ID', () => {
		expect(fileQuerySchema?.safeParse({ fileId: '12' }).success).to.be.true;
		expect(pathParamsSchema?.safeParse({ submissionId: '3' }).success).to.be.true;
	});

	it('rejects a file ID that is not digits only', () => {
		['1e2', '12abc', '1.5', '-1', '0x10', ''].forEach(
			(fileId) => expect(fileQuerySchema?.safeParse({ fileId }).success, fileId).to.be.false,
		);
	});

	it('rejects a file ID of 0 or above the largest serial value', () => {
		expect(fileQuerySchema?.safeParse({ fileId: '0' }).success).to.be.false;
		expect(fileQuerySchema?.safeParse({ fileId: '2147483648' }).success).to.be.false;
		expect(fileQuerySchema?.safeParse({ fileId: '2147483647' }).success).to.be.true;
	});

	it('rejects a submission ID that is not digits only', () => {
		expect(pathParamsSchema?.safeParse({ submissionId: '1e2' }).success).to.be.false;
	});
});

describe('submissionsByCategoryRequestSchema query', () => {
	const listQuerySchema = submissionsByCategoryRequestSchema.query;

	it('accepts a query with no parameters', () => {
		const result = listQuerySchema?.safeParse({});
		expect(result?.success).to.be.true;
	});

	it('accepts a sort with several keys', () => {
		const result = listQuerySchema?.safeParse({ sort: '-createdAt,organization' });
		expect(result?.success).to.be.true;
	});

	it('rejects a sort naming a field that cannot be sorted by, and lists the allowed fields', () => {
		const result = listQuerySchema?.safeParse({ sort: '-dictionaryId' });
		expect(result?.success).to.be.false;
		expect(result?.error?.issues[0]?.path).to.eql(['sort']);
		expect(result?.error?.issues[0]?.message).to.include('createdAt');
	});

	it('rejects a sort given more than once, since sort keys are comma-separated', () => {
		const result = listQuerySchema?.safeParse({ sort: ['createdAt', 'id'] });
		expect(result?.success).to.be.false;
	});

	it('accepts a single organization and several organizations', () => {
		expect(listQuerySchema?.safeParse({ organization: 'org-a' }).success).to.be.true;
		expect(listQuerySchema?.safeParse({ organization: ['org-a', 'org-b'] }).success).to.be.true;
	});

	it('accepts a single status and several statuses, in any case', () => {
		expect(listQuerySchema?.safeParse({ status: 'OPEN' }).success).to.be.true;
		expect(listQuerySchema?.safeParse({ status: ['committed', 'Closed'] }).success).to.be.true;
	});

	it('rejects an unknown status', () => {
		const result = listQuerySchema?.safeParse({ status: ['OPEN', 'DONE'] });
		expect(result?.success).to.be.false;
	});

	it('rejects status together with onlyActive=true', () => {
		const result = listQuerySchema?.safeParse({ onlyActive: 'true', status: 'OPEN' });
		expect(result?.success).to.be.false;
		expect(result?.error?.issues[0]?.path).to.eql(['status']);
	});

	it('accepts status together with onlyActive=false', () => {
		const result = listQuerySchema?.safeParse({ onlyActive: 'false', status: 'OPEN' });
		expect(result?.success).to.be.true;
	});

	it('rejects a page that is not a positive number', () => {
		const result = listQuerySchema?.safeParse({ page: 'abc' });
		expect(result?.success).to.be.false;
	});
});
