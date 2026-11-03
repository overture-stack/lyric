import { expect } from 'chai';
import { describe, it } from 'mocha';

import { getSubmissionBodyLimits } from '../../../src/utils/submissionLimits.js';

const JSON_PARSER_DEFAULT_SIZE = 100 * 1024;

describe('Submission body limits', () => {
	it('should limit each file and each JSON body by maxFileSize, and a whole upload by maxRequestSize', () => {
		const limits = getSubmissionBodyLimits({ maxFileSize: 10, maxRequestSize: 50 });
		expect(limits).to.eql({ fileSize: 10, jsonSize: 10, requestSize: 50 });
	});

	it('should set no per-file limit when maxFileSize is 0, leaving JSON bodies at the JSON parser default', () => {
		const limits = getSubmissionBodyLimits({ maxFileSize: 0, maxRequestSize: 50 });
		expect(limits).to.eql({ fileSize: undefined, jsonSize: JSON_PARSER_DEFAULT_SIZE, requestSize: 50 });
	});

	it('should set no whole-upload limit when maxRequestSize is 0 or omitted', () => {
		expect(getSubmissionBodyLimits({ maxFileSize: 10, maxRequestSize: 0 })).to.eql({
			fileSize: 10,
			jsonSize: 10,
			requestSize: undefined,
		});
		expect(getSubmissionBodyLimits({ maxFileSize: 10 })).to.eql({ fileSize: 10, jsonSize: 10, requestSize: undefined });
	});

	it('should apply only the JSON parser default when no limits are configured', () => {
		expect(getSubmissionBodyLimits(undefined)).to.eql({
			fileSize: undefined,
			jsonSize: JSON_PARSER_DEFAULT_SIZE,
			requestSize: undefined,
		});
	});
});
