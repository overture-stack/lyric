import * as _ from 'lodash-es';
import { z } from 'zod';

import { AUDIT_ACTION, AuditAction, AuditDataResponse, AuditRepositoryRecord } from './types.js';

/**
 * Convert Audit Action enum into an array of strings in uppercase to facilitate validation
 */
const upperCaseAuditActions: string[] = Object.values(AUDIT_ACTION).map((value) => value.toUpperCase());

/**
 * This function takes an array of values and casts it to a tuple type where the first element is of the same type as the array, and the rest are of the same type as well.
 */
const zodEnum = <T>(arr: T[]): [T, ...T[]] => arr as [T, ...T[]];

/**
 * Create Zod enum schema from uppercase enum values
 */
const auditActionSchema = z.enum(zodEnum(upperCaseAuditActions));

/**
 * Returns `true` if input value matches with a valid Audit Event type.
 * Otherwise returns `false`
 * @param {unknown} value
 * @returns {boolean}
 */
export const isAuditEventValid = (value: unknown): boolean =>
	typeof value === 'string' && auditActionSchema.safeParse(value.toUpperCase()).success;

/**
 * Convert a value string into it's Audit event type if it matches.
 * Otherwise it returns `undefined`
 * @param {string} value
 * @returns {AuditAction | undefined}
 */
export const convertToAuditEvent = (value: string): AuditAction | undefined => {
	const parseResult = auditActionSchema.safeParse(value.toUpperCase());

	if (parseResult.success) {
		return parseResult.data as AuditAction;
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
