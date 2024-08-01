import type { ParsedQs } from 'qs';
import { z } from 'zod';

import { isAuditEventValid } from './auditUtils.js';
import { isValidDateFormat } from './formatUtils.js';
import { RequestValidation } from './requestValidation.js';

// Pagination Request

export interface paginationQueryParams extends ParsedQs {
	page?: string;
	pageSize?: string;
}

const paginationQuerySchema = z.object({
	page: z
		.string()
		.superRefine((value, ctx) => {
			const parsed = parseInt(value);
			if (isNaN(parsed)) {
				ctx.addIssue({
					code: z.ZodIssueCode.invalid_type,
					expected: 'number',
					received: 'nan',
				});
			}

			if (parsed < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.too_small,
					minimum: 1,
					inclusive: true,
					type: 'number',
				});
			}
		})
		.optional(),

	pageSize: z
		.string()
		.superRefine((value, ctx) => {
			const parsed = parseInt(value);
			if (isNaN(parsed)) {
				ctx.addIssue({
					code: z.ZodIssueCode.invalid_type,
					expected: 'number',
					received: 'nan',
				});
			}

			if (parsed < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.too_small,
					minimum: 1,
					inclusive: true,
					type: 'number',
				});
			}
		})
		.optional(),
});

export const paginationQueryRequestValidation: RequestValidation<object, paginationQueryParams> = {
	query: paginationQuerySchema,
};

// Audit Request

export interface auditQueryParams extends ParsedQs {
	entityName?: string;
	eventType?: string;
	systemId?: string;
	startDate?: string;
	endDate?: string;
}

const auditQuerySchema = z
	.object({
		entityName: z.string().trim().min(1).optional(),
		eventType: z
			.string()
			.trim()
			.min(1)
			.refine((value) => isAuditEventValid(value), 'Request provided an invalid Event Type')
			.optional(),
		systemId: z.string().trim().min(1).optional(),
		startDate: z
			.string()
			.trim()
			.min(1)
			.refine((value) => isValidDateFormat(value), 'Invalid `startDate` parameter')
			.optional(),
		endDate: z
			.string()
			.trim()
			.min(1)
			.refine((value) => isValidDateFormat(value), 'Invalid `endDate` parameter')
			.optional(),
	})
	.merge(paginationQuerySchema);

export const auditRequestSchema: RequestValidation<object, paginationQueryParams & auditQueryParams> = {
	query: auditQuerySchema,
};

// Register Dictionary Request

export interface registerDictionaryQueryParams {
	categoryName: string;
	dictionaryName: string;
	version: string;
}

export const registerDictionaryQuerySchema = z.object({
	categoryName: z.string(),
	dictionaryName: z.string(),
	version: z.string(),
});

export const registerDictionaryRequestSchema: RequestValidation<registerDictionaryQueryParams, ParsedQs> = {
	body: registerDictionaryQuerySchema,
};

// Upload Submission

export const uploadSubmissionRequestSchema: RequestValidation<{ organization: string }, ParsedQs> = {
	body: z.object({
		organization: z.string(),
	}),
};
