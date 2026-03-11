import { expect } from 'chai';
import { describe, it } from 'mocha';

import { uploadSubmissionRequestSchema } from '../../../src/utils/schemas.js';

const bodySchema = uploadSubmissionRequestSchema.body;

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
