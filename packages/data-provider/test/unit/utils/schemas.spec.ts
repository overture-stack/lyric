import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	categoryPathParamsSchema,
	migrationByIdRequestSchema,
	submissionByIdRequestSchema,
	submissionDeleteEntityNameRequestSchema,
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

describe('categoryPathParamsSchema', () => {
	it('should accept a numeric categoryId', () => {
		expect(categoryPathParamsSchema.safeParse({ categoryId: '1' }).success).to.be.true;
	});

	it('should accept a categoryId with a numeric prefix only because it is a valid alias shape', () => {
		expect(categoryPathParamsSchema.safeParse({ categoryId: '1abc' }).success).to.be.true;
	});

	it('should reject a categoryId with a numeric prefix that is not a valid alias shape', () => {
		expect(categoryPathParamsSchema.safeParse({ categoryId: '1 abc' }).success).to.be.false;
	});
});

describe('submissionByIdRequestSchema pathParams', () => {
	const pathParamsSchema = submissionByIdRequestSchema.pathParams;

	it('should accept a numeric submissionId', () => {
		expect(pathParamsSchema?.safeParse({ submissionId: '5' }).success).to.be.true;
	});

	it('should reject a submissionId with a numeric prefix followed by letters', () => {
		expect(pathParamsSchema?.safeParse({ submissionId: '5abc' }).success).to.be.false;
	});
});

describe('migrationByIdRequestSchema pathParams', () => {
	const pathParamsSchema = migrationByIdRequestSchema.pathParams;

	it('should accept a numeric migrationId', () => {
		expect(pathParamsSchema?.safeParse({ migrationId: '5' }).success).to.be.true;
	});

	it('should reject a migrationId with a numeric prefix followed by letters', () => {
		expect(pathParamsSchema?.safeParse({ migrationId: '5abc' }).success).to.be.false;
	});
});

describe('pagination query params', () => {
	// submissionsByCategoryRequestSchema stands in for every schema merging paginationQuerySchema
	const querySchema = submissionsByCategoryRequestSchema.query;

	it('should accept positive integer page and pageSize', () => {
		expect(querySchema?.safeParse({ page: '2', pageSize: '20' }).success).to.be.true;
	});

	it('should accept a request without page or pageSize', () => {
		expect(querySchema?.safeParse({}).success).to.be.true;
	});

	it('should reject a page with a numeric prefix followed by letters', () => {
		expect(querySchema?.safeParse({ page: '2abc' }).success).to.be.false;
	});

	it('should reject a pageSize with a numeric prefix followed by letters', () => {
		expect(querySchema?.safeParse({ pageSize: '10x' }).success).to.be.false;
	});

	it('should reject a zero, negative or decimal page and pageSize', () => {
		for (const value of ['0', '-1', '1.5', '1e3', '']) {
			expect(querySchema?.safeParse({ page: value }).success, `page '${value}'`).to.be.false;
			expect(querySchema?.safeParse({ pageSize: value }).success, `pageSize '${value}'`).to.be.false;
		}
	});
});

describe('submissionDeleteEntityNameRequestSchema query index', () => {
	const querySchema = submissionDeleteEntityNameRequestSchema.query;

	it('should accept a zero-based index, including 0', () => {
		expect(querySchema?.safeParse({ entityName: 'donor', index: '0' }).success).to.be.true;
		expect(querySchema?.safeParse({ entityName: 'donor', index: '3' }).success).to.be.true;
	});

	it('should accept a request without an index', () => {
		expect(querySchema?.safeParse({ entityName: 'donor' }).success).to.be.true;
	});

	it('should reject an index with a numeric prefix followed by letters', () => {
		expect(querySchema?.safeParse({ entityName: 'donor', index: '1abc' }).success).to.be.false;
	});

	it('should reject a negative or decimal index', () => {
		for (const value of ['-1', '1.5', '1e3', '']) {
			expect(querySchema?.safeParse({ entityName: 'donor', index: value }).success, `index '${value}'`).to.be.false;
		}
	});
});
