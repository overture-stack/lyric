import { expect } from 'chai';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, it } from 'mocha';

import { buildDataFieldFilter } from '../../../src/repository/submittedRepository.js';

const dialect = new PgDialect();

describe('submittedRepository', () => {
	describe('buildDataFieldFilter', () => {
		it('should build a parameterized filter comparing a JSONB field against a value', () => {
			const result = buildDataFieldFilter('submitter_donor_id', 'DO-01');
			const { sql, params } = dialect.sqlToQuery(result);

			expect(sql).to.eql('data ->> $1 IN ($2)');
			expect(params).to.eql(['submitter_donor_id', 'DO-01']);
		});

		it('should bind a dataField containing SQL metacharacters as a parameter, not as SQL text', () => {
			// Regression coverage for a stored SQL injection: dataField/dataValue here can originate
			// from a submitter's own submitted data (see searchDataRelations.ts, viewMode.ts), so they
			// must never be spliced into the query text.
			const result = buildDataFieldFilter(`x' OR '1'='1`, 'a');
			const { sql, params } = dialect.sqlToQuery(result);

			expect(sql).to.eql('data ->> $1 IN ($2)');
			expect(params).to.eql([`x' OR '1'='1`, 'a']);
		});

		it('should bind a dataValue containing a statement terminator and comment marker as a parameter', () => {
			const result = buildDataFieldFilter('submitter_donor_id', `DO-01'; DROP TABLE submitted_data; --`);
			const { sql, params } = dialect.sqlToQuery(result);

			expect(sql).to.eql('data ->> $1 IN ($2)');
			expect(params).to.eql(['submitter_donor_id', `DO-01'; DROP TABLE submitted_data; --`]);
		});

		it('should coerce an undefined dataValue to the string "undefined", matching prior behaviour', () => {
			const result = buildDataFieldFilter('submitter_donor_id', undefined);
			const { params } = dialect.sqlToQuery(result);

			expect(params).to.eql(['submitter_donor_id', 'undefined']);
		});
	});
});
