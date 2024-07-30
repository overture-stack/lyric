import { expect } from 'chai';
import { describe, it } from 'mocha';

import { convertToAuditEvent, isAuditEventValid, parseAuditRecords } from '../../src/utils/auditUtils.js';
import { AuditDataRepository, AuditDataResponse } from '../../src/utils/types.js';

describe('Audit functions test', () => {
	describe('Validate Audit Event type', () => {
		it('should return true if input corresponds to a valid Audit Event', () => {
			const response = isAuditEventValid('UPDATE');
			expect(response).to.be.true;
		});

		it('should return false if input does not correspond to an Audit Event', () => {
			const response = isAuditEventValid('MODIFICATIONS');
			expect(response).to.be.false;
		});
	});

	describe('Convert a string into a Audit Event type', () => {
		it('should return a valid Event ', () => {
			const responseUpdate = convertToAuditEvent('UPDATE');
			const responseDelete = convertToAuditEvent('DELETE');

			expect(responseUpdate).to.eql('UPDATE');
			expect(responseDelete).to.eql('DELETE');
		});
		it('should return undefined if input is not a valid Event', () => {
			const response = convertToAuditEvent('MODIFICATIONS');
			expect(response).to.be.undefined;
		});
	});

	describe('Convert Audit object', () => {
		it('should return a valid Audit object', () => {
			const date = new Date();

			const repositoryObject: AuditDataRepository = {
				action: 'DELETE',
				comment: null,
				entityName: 'sport',
				newData: null,
				newDataIsValid: false,
				oldData: null,
				oldDataIsValid: false,
				organization: 'fifa',
				systemId: 'xyz123',
				updatedAt: date,
				updatedBy: 'user1',
			};

			const expectedObject: AuditDataResponse = {
				comment: '',
				entityName: 'sport',
				event: 'DELETE',
				newData: null,
				newIsValid: false,
				oldData: null,
				oldIsValid: false,
				organization: 'fifa',
				systemId: 'xyz123',
				updatedAt: date.toISOString(),
				updatedBy: 'user1',
			};

			const parsedResponse = parseAuditRecords([repositoryObject]);
			expect(parsedResponse).to.be.lengthOf(1);
			expect(parsedResponse[0]).to.eql(expectedObject);
		});
	});
});
