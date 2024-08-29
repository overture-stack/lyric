import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z } from 'zod';

import type { SQON } from '@overture-stack/sqon-builder';

import { isAuditEventValid, isSubmissionActionTypeValid } from './auditUtils.js';
import { parseSQON } from './convertSqonToQuery.js';
import { isValidDateFormat, isValidIdNumber } from './formatUtils.js';
import { RequestValidation } from './requestValidation.js';

const auditEventTypeSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isAuditEventValid(value), 'invalid Event Type');

const categoryIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'invalid category ID');

const endDateSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'invalid `endDate` parameter');

const entityNameSchema = z.string().trim().min(1);

const organizationSchema = z.string().trim().min(1);

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

const indexIntegerSchema = z.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) {
		ctx.addIssue({
			code: z.ZodIssueCode.invalid_type,
			expected: 'number',
			received: 'nan',
		});
	}
});

const positiveInteger = z.string().superRefine((value, ctx) => {
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
}, 'invalid SQON format');

const startDateSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'invalid `startDate` parameter');

const submissionActionTypeSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => isSubmissionActionTypeValid(value), 'invalid Submission Action Type');

const submissionIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'invalid submission ID');

const stringNotEmpty = z.string().trim().min(1);

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
	page: positiveInteger.optional(),
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
		eventType: auditEventTypeSchema.optional(),
		systemId: stringNotEmpty.optional(),
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
		categoryName: stringNotEmpty,
		dictionaryName: stringNotEmpty,
		version: stringNotEmpty,
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
	actionType: string;
	submissionId: string;
}

export interface submissionDeleteEntityNameQueryParams extends ParsedQs {
	entityName: string;
	index?: string;
}

export const submissionDeleteEntityNameRequestSchema: RequestValidation<
	object,
	submissionDeleteEntityNameQueryParams,
	submissionDeleteEntityNameParams
> = {
	query: z.object({
		entityName: entityNameSchema,
		index: indexIntegerSchema.optional(),
	}),
	pathParams: z.object({
		actionType: submissionActionTypeSchema,
		submissionId: submissionIdSchema,
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

export const dataDeleteBySystemIdRequestSchema: RequestValidation<object, ParsedQs, dataDeleteBySystemIdPathParams> = {
	pathParams: z.object({
		systemId: stringNotEmpty,
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
