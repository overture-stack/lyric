import { expect } from 'chai';
import { describe, it } from 'mocha';

import { convertToAuditEvent, isAuditEventValid, parseAuditRecords } from '../../src/utils/auditUtils.js';
import { AuditDataResponse, AuditRepositoryRecord } from '../../src/utils/types.js';

describe('Audit utils', () => {
	describe('Validate Audit Event type', () => {
		it('should return true if input corresponds to a valid Audit Event in uppercase (UPDATE)', () => {
			const response = isAuditEventValid('UPDATE');
			expect(response).to.be.true;
		});

		it('should return true if input corresponds to a valid Audit Event in lowercase (delete)', () => {
			const response = isAuditEventValid('delete');
			expect(response).to.be.true;
		});

		it('should return false if input does not correspond to an Audit Event', () => {
			const response = isAuditEventValid('MODIFICATIONS');
			expect(response).to.be.false;
		});

		it('should return false if input is a number', () => {
			const response = isAuditEventValid(123);
			expect(response).to.be.false;
		});

		it('should return false if input is an objec', () => {
			const response = isAuditEventValid({});
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

			const repositoryObject: AuditRepositoryRecord = {
				action: 'DELETE',
				entityName: 'sport',
				dataDiff: null,
				newDataIsValid: false,
				oldDataIsValid: false,
				organization: 'fifa',
				submissionId: 9,
				systemId: 'xyz123',
				createdAt: date,
				createdBy: 'user1',
			};

			const expectedObject: AuditDataResponse = {
				entityName: 'sport',
				event: 'DELETE',
				dataDiff: null,
				newIsValid: false,
				oldIsValid: false,
				organization: 'fifa',
				submissionId: 9,
				systemId: 'xyz123',
				createdAt: date.toISOString(),
				createdBy: 'user1',
			};

			const parsedResponse = parseAuditRecords([repositoryObject]);
			expect(parsedResponse).to.be.lengthOf(1);
			expect(parsedResponse[0]).to.eql(expectedObject);
		});
	});
});
