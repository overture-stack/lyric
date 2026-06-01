import type { Request } from 'express';

import type { RequestWithUser } from '../middleware/auth.js';

export const ActionType = {
	READ: 'READ',
	WRITE: 'WRITE',
} as const;

export type ActionTypeValues = (typeof ActionType)[keyof typeof ActionType];

export const ActionResult = {
	ALLOWED: 'ALLOWED',
	DENIED: 'DENIED',
} as const;

export type ActionResultValues = (typeof ActionResult)[keyof typeof ActionResult];

export interface ActionLogMetadata {
	action: ActionTypeValues;
	method: string;
	path: string;
	categoryId?: number;
	organization?: string;
	userId?: string;
	entityName?: string;
	systemId?: string;
	submissionId?: number;
}

/**
 * Determines if an HTTP method represents a read or write operation
 */
export const getActionType = (method: string): ActionTypeValues => {
	return method === 'GET' || method === 'HEAD' ? ActionType.READ : ActionType.WRITE;
};

/**
 * Extracts category ID from request parameters
 */
export const extractCategoryId = (req: Request): number | undefined => {
	const categoryId = req.params.categoryId;
	if (categoryId) {
		const parsed = Number(categoryId);
		return isNaN(parsed) ? undefined : parsed;
	}
	return;
};

/**
 * Extracts organization from request parameters or query
 */
export const extractOrganization = (req: Request): string | undefined => {
	// Check params first
	if (req.params.organization) {
		return req.params.organization;
	}
	// Check query string
	if (req.query.organization && typeof req.query.organization === 'string') {
		return req.query.organization;
	}
	return;
};

/**
 * Extracts entity name from request parameters or query
 */
export const extractEntityName = (req: Request): string | undefined => {
	// Check params first
	if (req.params.entityName && typeof req.params.entityName === 'string') {
		return req.params.entityName;
	}
	// Check query string
	if (req.query.entityName && typeof req.query.entityName === 'string') {
		return req.query.entityName;
	}
	return;
};

/**
 * Extracts system ID from request parameters
 */
export const extractSystemId = (req: Request): string | undefined => {
	return req.params.systemId;
};

/**
 * Extracts submission ID from request parameters
 */
export const extractSubmissionId = (req: Request): number | undefined => {
	const submissionId = req.params.submissionId;
	if (submissionId) {
		const parsed = Number(submissionId);
		return isNaN(parsed) ? undefined : parsed;
	}
	return;
};

/**
 * Extracts user ID from request
 */
export const extractUserId = (req: RequestWithUser): string | undefined => {
	return req.user?.username;
};

/**
 * Extracts all relevant metadata from a request for action logging
 */
export const extractActionMetadata = (req: RequestWithUser): ActionLogMetadata => {
	return {
		action: getActionType(req.method),
		method: req.method,
		path: req.originalUrl || req.path,
		categoryId: extractCategoryId(req),
		organization: extractOrganization(req),
		userId: extractUserId(req),
		entityName: extractEntityName(req),
		systemId: extractSystemId(req),
		submissionId: extractSubmissionId(req),
	};
};

/**
 * Formats action log metadata into a readable string for logging
 */
export const formatActionLog = (
	metadata: ActionLogMetadata,
	statusResult: ActionResultValues,
	statusCode: number,
	duration: number,
	errorMessage?: string,
): string => {
	const actionLogResult = [`ACTION_LOG - PATH=${metadata.path}`, `type=|${metadata.action}-${metadata.method}|`];

	// Parameter metadata if exists
	if (metadata.categoryId !== undefined) {
		actionLogResult.push(`categoryId: ${metadata.categoryId}`);
	}

	if (metadata.organization) {
		actionLogResult.push(`organization: ${metadata.organization}`);
	}

	if (metadata.entityName) {
		actionLogResult.push(`entityName: ${metadata.entityName}`);
	}

	if (metadata.systemId) {
		actionLogResult.push(`systemId: ${metadata.systemId}`);
	}

	if (metadata.submissionId !== undefined) {
		actionLogResult.push(`submissionId: ${metadata.submissionId}`);
	}

	actionLogResult.push(`userId: ${metadata.userId || 'null'}`);
	actionLogResult.push(`result: ${statusResult}`);
	actionLogResult.push(`status: ${statusCode}`);
	actionLogResult.push(`duration: ${duration}ms`);

	if (errorMessage) {
		actionLogResult.push(`error: ${errorMessage}`);
	}

	return actionLogResult.join(' | ');
};
