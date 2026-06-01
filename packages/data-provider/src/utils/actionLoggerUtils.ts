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
 * Extracts all relevant metadata from a request for action logging
 */
export const extractActionMetadata = (req: RequestWithUser): ActionLogMetadata => {
	return {
		action: getActionType(req.method),
		method: req.method,
		path: req.originalUrl || req.path,
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

	actionLogResult.push(`userId: ${metadata.userId || 'null'}`);
	actionLogResult.push(`result: ${statusResult}`);
	actionLogResult.push(`status: ${statusCode}`);
	actionLogResult.push(`duration: ${duration}ms`);

	if (errorMessage) {
		actionLogResult.push(`error: ${errorMessage}`);
	}

	return actionLogResult.join(' | ');
};
