import * as _ from 'lodash-es';

import {
	AUDIT_ACTION,
	AuditAction,
	AuditDataResponse,
	AuditRepositoryRecord,
	SUBMISSION_ACTION_TYPE,
} from './types.js';

/**
 * Returns `true` if input value matches with a valid Audit Event type.
 * Otherwise returns `false`
 * @param {unknown} value
 * @returns {boolean}
 */
export const isAuditEventValid = (value: unknown): boolean =>
	typeof value === 'string' && AUDIT_ACTION.safeParse(value.toUpperCase()).success;

export const isSubmissionActionTypeValid = (value: unknown): boolean =>
	typeof value === 'string' && SUBMISSION_ACTION_TYPE.safeParse(value.toUpperCase()).success;

/**
 * Convert a value string into it's Audit event type if it matches.
 * Otherwise it returns `undefined`
 * @param {string} value
 * @returns {AuditAction | undefined}
 */
export const convertToAuditEvent = (value: string): AuditAction | undefined => {
	const parseResult = AUDIT_ACTION.safeParse(value.toUpperCase());

	if (parseResult.success) {
		return parseResult.data;
	}
	return undefined;
};

/**
 * Parsing function to map Audit data fields
 * @param {AuditRepositoryRecord[]} data
 * @returns {AuditDataResponse[]}
 */
export const parseAuditRecords = (data: AuditRepositoryRecord[]): AuditDataResponse[] => {
	return data.map((record) => ({
		entityName: record.entityName,
		event: record.action,
		dataDiff: record.dataDiff,
		newIsValid: record.newDataIsValid,
		oldIsValid: record.oldDataIsValid,
		organization: _.toString(record.organization),
		submissionId: record.submissionId,
		systemId: record.systemId,
		createdAt: _.toString(record.createdAt?.toISOString()),
		createdBy: _.toString(record.createdBy),
	}));
};
