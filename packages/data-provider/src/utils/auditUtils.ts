import * as _ from 'lodash-es';

import { AUDIT_ACTION, AuditAction, AuditDataRepository, AuditDataResponse } from './types.js';

/**
 * Returns `true` if input value matches with a valid Audit Event type.
 * Otherwise returns `false`
 * @param {unknown} value
 * @returns {boolean}
 */
export const isAuditEventValid = (value: unknown): boolean => {
	return (
		typeof value === 'string' &&
		[AUDIT_ACTION.DELETE.toString(), AUDIT_ACTION.UPDATE.toString()].includes(value.toUpperCase())
	);
};

/**
 * Convert a value string into it's Audit event type if it matches.
 * Otherwise it returns `undefined`
 * @param {string} value
 * @returns {AuditAction | undefined}
 */
export const convertToAuditEvent = (value: string): AuditAction | undefined => {
	if (isAuditEventValid(value)) {
		if (value.toUpperCase() === AUDIT_ACTION.UPDATE.toString()) return AUDIT_ACTION.UPDATE;
		else if (value.toUpperCase() === AUDIT_ACTION.DELETE.toString()) return AUDIT_ACTION.DELETE;
	}
	return undefined;
};

/**
 * Parsing function to map Audit data fields
 * @param {AuditDataRepository[]} data
 * @returns {AuditDataResponse[]}
 */
export const parseAuditRecords = (data: AuditDataRepository[]): AuditDataResponse[] => {
	return data.map((record) => ({
		comment: _.toString(record.comment),
		entityName: record.entityName,
		event: record.action,
		newData: record.newData,
		newIsValid: record.newDataIsValid,
		oldData: record.oldData,
		oldIsValid: record.oldDataIsValid,
		organization: _.toString(record.organization),
		systemId: record.systemId,
		updatedAt: _.toString(record.updatedAt?.toISOString()),
		updatedBy: _.toString(record.updatedBy),
	}));
};
