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
	return method === 'GET' || method === 'HEAD' ? 'READ' : 'WRITE';
};

/**
 * Extracts category ID from request parameters
 */
export const extractCategoryId = (req: Request) => {
	const categoryId = Number(req.params.categoryId);

	if (categoryId) {
		const parsed = Number(categoryId);
		return isNaN(parsed) ? undefined : parsed;
	}
	return;
};

/**
 * Extracts organization from request parameters or query
 */
export const extractOrganization = (req: Request) => {
	if (req.params.organization) {
		return req.params.organization;
	}
	if (req.query.organization && typeof req.query.organization === 'string') {
		return req.query.organization;
	}
	return;
};

/**
 * Extracts entity name from request parameters or query
 */
export const extractEntityName = (req: Request) => {
	if (req.params.entityName && typeof req.params.entityName === 'string') {
		return req.params.entityName;
	}
	if (req.query.entityName && typeof req.query.entityName === 'string') {
		return req.query.entityName;
	}
	return;
};

/**
 * Extracts system ID from request parameters
 */
export const extractSystemId = (req: Request) => {
	return req.params.systemId;
};

/**
 * Extracts submission ID from request parameters
 */
export const extractSubmissionId = (req: Request) => {
	const submissionId = req.params.submissionId;
	if (submissionId) {
		const parsed = Number(submissionId);
		return isNaN(parsed) ? undefined : parsed;
	}
	return;
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
		entityName: extractEntityName(req),
		systemId: extractSystemId(req),
		submissionId: extractSubmissionId(req),
	};
};

/**
 * Determines if a route should be logged
 * Excludes health checks, ping, and other non-data routes
 */
export const shouldLogRoute = (path: string): boolean => {
	const excludedPaths = ['/health', '/ping', '/api-docs'];
	return !excludedPaths.some((excluded) => path.startsWith(excluded));
};

/**
 * Formats action log metadata into a readable string for logging
 */
export const formatActionLog = (
	metadata: ActionLogMetadata,
	result: ActionResultValues,
	statusCode: number,
	duration?: number,
	errorMessage?: string,
): string => {
	const parts = ['[ACTION_LOG]', metadata.action, metadata.method, metadata.path];

	if (metadata.categoryId) {
		parts.push(`categoryId: ${metadata.categoryId}`);
	}

	if (metadata.organization) {
		parts.push(`organization: ${metadata.organization}`);
	}

	if (metadata.entityName) {
		parts.push(`entityName: ${metadata.entityName}`);
	}

	if (metadata.systemId) {
		parts.push(`systemId: ${metadata.systemId}`);
	}

	if (metadata.submissionId) {
		parts.push(`submissionId: ${metadata.submissionId}`);
	}

	parts.push(`result: ${result}`);
	parts.push(`status: ${statusCode}`);

	if (duration) {
		parts.push(`duration: ${duration}ms`);
	}

	if (errorMessage) {
		parts.push(`error: ${errorMessage}`);
	}

	return parts.join(' - ');
};
