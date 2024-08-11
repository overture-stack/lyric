import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z } from 'zod';

import type { SQON } from '@overture-stack/sqon-builder';

import { isAuditEventValid } from './auditUtils.js';
import { parseSQON } from './convertSqonToQuery.js';
import { isValidDateFormat, isValidIdNumber } from './formatUtils.js';
import { RequestValidation } from './requestValidation.js';

const categoryIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'Request provided an invalid category ID');

const commentSchema = z.string().trim().min(1);

const dryRunSchema = z
	.string()
	.toLowerCase()
	.refine((value) => value === 'true' || value === 'false', {
		message: 'Value must be a boolean',
	});

const endDateSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'Invalid `endDate` parameter');

const entityNameSchema = z.string().trim().min(1);

const eventTypeSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isAuditEventValid(value), 'Request provided an invalid Event Type');

const organizationSchema = z.string().trim().min(1);

const pageSchema = z.string().superRefine((value, ctx) => {
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
});

const pageSizeSchema = z.string().superRefine((value, ctx) => {
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
});

const sqonSchema = z.custom<SQON>((value) => {
	try {
		parseSQON(value);
		return true;
	} catch (error) {
		return false;
	}
}, 'Invalid SQON format');

const startDateSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'Invalid `startDate` parameter');

const submissionIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'Request provided an invalid submission ID');

const systemIdSchema = z.string().trim().min(1);

// Common Category Path Params
export interface categoryPathParams extends ParamsDictionary {
	categoryId: string;
}

export const categoryPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
});

// Common Category and Organization Path Params

export interface categoryOrganizationPathParams extends ParamsDictionary {
	categoryId: string;
	organization: string;
}

export const categoryOrganizationPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
	organization: organizationSchema,
});

// Common Submission Path Params

export interface submissionIdPathParam extends ParamsDictionary {
	submissionId: string;
}

const submissionIdPathParamSchema = z.object({
	submissionId: submissionIdSchema,
});

// Common Pagination Query Params

export interface paginationQueryParams extends ParsedQs {
	page?: string;
	pageSize?: string;
}

const paginationQuerySchema = z.object({
	page: pageSchema.optional(),
	pageSize: pageSizeSchema.optional(),
});

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
		entityName: entityNameSchema.optional(),
		eventType: eventTypeSchema.optional(),
		systemId: systemIdSchema.optional(),
		startDate: startDateSchema.optional(),
		endDate: endDateSchema.optional(),
	})
	.merge(paginationQuerySchema);

export const auditByCatAndOrgRequestSchema: RequestValidation<
	object,
	paginationQueryParams & auditQueryParams,
	categoryOrganizationPathParams
> = {
	query: auditQuerySchema,
	pathParams: categoryOrganizationPathParamsSchema,
};

// Category Request

export const cagegoryDetailsRequestSchema: RequestValidation<object, ParsedQs, categoryPathParams> = {
	pathParams: categoryPathParamsSchema,
};

// Dictionary Request

export interface dictionaryRegisterBodyParams {
	categoryName: string;
	dictionaryName: string;
	version: string;
}

export const dictionaryRegisterRequestSchema: RequestValidation<
	dictionaryRegisterBodyParams,
	ParsedQs,
	ParamsDictionary
> = {
	body: z.object({
		categoryName: z.string().trim().min(1),
		dictionaryName: z.string().trim().min(1),
		version: z.string().trim().min(1),
	}),
};

// Submission Requests

export const submissionActiveyByCategoryRequestSchema: RequestValidation<object, ParsedQs, categoryPathParams> = {
	pathParams: categoryPathParamsSchema,
};

export const submissionActiveByIdRequestSchema: RequestValidation<object, ParsedQs, submissionIdPathParam> = {
	pathParams: submissionIdPathParamSchema,
};

export const submissionActiveByOrganizationRequestSchema: RequestValidation<
	object,
	ParsedQs,
	categoryOrganizationPathParams
> = {
	pathParams: categoryOrganizationPathParamsSchema,
};

export interface submissionCommitPathParams extends ParamsDictionary {
	categoryId: string;
	submissionId: string;
}

export const submissionCommitRequestSchema: RequestValidation<object, ParsedQs, submissionCommitPathParams> = {
	pathParams: z.object({
		categoryId: categoryIdSchema,
		submissionId: submissionIdSchema,
	}),
};

export const submissionDeleteRequestSchema: RequestValidation<object, ParsedQs, submissionIdPathParam> = {
	pathParams: submissionIdPathParamSchema,
};

export interface submissionDeleteEntityNameParams extends ParamsDictionary {
	submissionId: string;
	entityName: string;
}

export const submissionDeleteEntityNameRequestSchema: RequestValidation<
	object,
	ParsedQs,
	submissionDeleteEntityNameParams
> = {
	pathParams: z.object({
		submissionId: submissionIdSchema,
		entityName: entityNameSchema,
	}),
};

export const uploadSubmissionRequestSchema: RequestValidation<{ organization: string }, ParsedQs, categoryPathParams> =
	{
		body: z.object({
			organization: organizationSchema,
		}),
		pathParams: categoryPathParamsSchema,
	};

// Submitted Data

export interface dataDeleteBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
}

export interface dataDeleteBySystemIdQueryParams extends ParsedQs {
	dryRun?: string;
	comment: string;
}

export const dataDeleteBySystemIdRequestSchema: RequestValidation<
	object,
	dataDeleteBySystemIdQueryParams,
	dataDeleteBySystemIdPathParams
> = {
	query: z.object({
		dryRun: dryRunSchema.optional(),
		comment: commentSchema,
	}),
	pathParams: z.object({
		systemId: systemIdSchema,
	}),
};

export interface dataQueryParams extends paginationQueryParams {
	entityName?: string | string[];
}

export const dataGetByCategoryRequestSchema: RequestValidation<object, dataQueryParams, categoryPathParams> = {
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
		})
		.merge(paginationQuerySchema),
	pathParams: categoryPathParamsSchema,
};

export const dataGetByOrganizationRequestSchema: RequestValidation<
	object,
	dataQueryParams,
	categoryOrganizationPathParams
> = {
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
		})
		.merge(paginationQuerySchema),
	pathParams: categoryOrganizationPathParamsSchema,
};

export const dataGetByQueryRequestschema: RequestValidation<object, dataQueryParams, categoryOrganizationPathParams> = {
	body: sqonSchema,
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
		})
		.merge(paginationQuerySchema),
	pathParams: categoryOrganizationPathParamsSchema,
};
