import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z } from 'zod';
import type { DataRecord } from '@overture-stack/lectern-client';
import type { SQON } from '@overture-stack/sqon-builder';

import { isAuditEventValid, isSubmissionActionTypeValid } from './auditUtils.js';
import { parseSQON } from './convertSqonToQuery.js';
import { isValidDateFormat, isValidIdNumber } from './formatUtils.js';
import { RequestValidation } from './requestValidation.js';
import { VIEW_TYPE } from './types.js';

const auditEventTypeSchema = z
	.string()
	.trim()
	.min(1)
	.refine((v) => isAuditEventValid(v), 'invalid Event Type');
const booleanSchema = z
	.string()
	.toLowerCase()
	.refine((v) => v === 'true' || v === 'false');
const viewSchema = z.string().toLowerCase().trim().min(1).pipe(VIEW_TYPE);
const categoryIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((v) => isValidIdNumber(parseInt(v)), 'invalid category ID');
const endDateSchema = z.string().trim().min(1).refine(isValidDateFormat, 'invalid `endDate` parameter');
const entityNameSchema = z.string().trim().min(1);
const organizationSchema = z.string().trim().min(1);

const pageSizeSchema = z.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'number', received: 'nan' });
	if (parsed < 1) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, inclusive: true, type: 'number' });
});

const indexIntegerSchema = z.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'number', received: 'nan' });
});

const positiveInteger = z.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'number', received: 'nan' });
	if (parsed < 1) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, inclusive: true, type: 'number' });
});

const sqonSchema = z.custom<SQON>((value) => {
	try {
		parseSQON(value);
		return true;
	} catch {
		return false;
	}
}, 'invalid SQON format');

const startDateSchema = z.string().trim().min(1).refine(isValidDateFormat, 'invalid `startDate` parameter');
const submissionActionTypeSchema = z
	.string()
	.trim()
	.min(1)
	.refine(isSubmissionActionTypeValid, 'invalid Submission Action Type');
const submissionIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((v) => isValidIdNumber(parseInt(v)), 'invalid submission ID');

const stringNotEmpty = z.string().trim().min(1);

// ---------- Common path/query schemas ----------
export interface categoryPathParams extends ParamsDictionary {
	categoryId: string;
}
export const categoryPathParamsSchema = z.object({ categoryId: categoryIdSchema });

export interface categoryOrganizationPathParams extends ParamsDictionary {
	categoryId: string;
	organization: string;
}
export const categoryOrganizationPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
	organization: organizationSchema,
});

export interface submissionIdPathParam extends ParamsDictionary {
	submissionId: string;
}
const submissionIdPathParamSchema = z.object({ submissionId: submissionIdSchema });

export interface paginationQueryParams extends ParsedQs {
	page?: string;
	pageSize?: string;
}
const paginationQuerySchema = z.object({ page: positiveInteger.optional(), pageSize: pageSizeSchema.optional() });

// ---------- Audit ----------
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

// ---------- Category ----------
export const cagegoryDetailsRequestSchema: RequestValidation<object, ParsedQs, categoryPathParams> = {
	pathParams: categoryPathParamsSchema,
};

// ---------- Dictionary ----------
export interface dictionaryRegisterBodyParams {
	categoryName: string;
	dictionaryName: string;
	dictionaryVersion: string; // string only (e.g., "1.0")
	defaultCentricEntity?: string | string[]; // union (schema input == output)
}

const dictionaryRegisterBodySchema = z.object({
	categoryName: stringNotEmpty,
	dictionaryName: stringNotEmpty,
	dictionaryVersion: z.string().trim().min(1),
	// allow "", string, string[], or omit; we normalize in controller
	defaultCentricEntity: z.union([z.string(), z.array(z.string())]).optional(),
});

export const dictionaryRegisterRequestSchema: RequestValidation<
	dictionaryRegisterBodyParams,
	ParsedQs,
	ParamsDictionary
> = {
	body: dictionaryRegisterBodySchema,
};

// ---------- Submissions ----------
export interface submissionsByCategoryQueryParams extends paginationQueryParams {
	onlyActive?: string;
	organization?: string;
	username?: string;
}
export const submissionsByCategoryRequestSchema: RequestValidation<
	object,
	submissionsByCategoryQueryParams,
	categoryPathParams
> = {
	query: z.object({
		onlyActive: booleanSchema.default('false'),
		organization: organizationSchema.optional(),
		username: stringNotEmpty.optional(),
	}),
	pathParams: categoryPathParamsSchema,
};

export const submissionByIdRequestSchema: RequestValidation<object, ParsedQs, submissionIdPathParam> = {
	pathParams: submissionIdPathParamSchema,
};
export const submissionActiveByOrganizationRequestSchema: RequestValidation<
	object,
	ParsedQs,
	categoryOrganizationPathParams
> = { pathParams: categoryOrganizationPathParamsSchema };

export interface submissionCommitPathParams extends ParamsDictionary {
	categoryId: string;
	submissionId: string;
}
export const submissionCommitRequestSchema: RequestValidation<object, ParsedQs, submissionCommitPathParams> = {
	pathParams: z.object({ categoryId: categoryIdSchema, submissionId: submissionIdSchema }),
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
	query: z.object({ entityName: entityNameSchema, index: indexIntegerSchema.optional() }),
	pathParams: z.object({ actionType: submissionActionTypeSchema, submissionId: submissionIdSchema }),
};

export interface uploadSubmissionRequestQueryParams extends ParsedQs {
	entityName: string;
	organization: string;
}
const dataRecordValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string()),
	z.array(z.number()),
	z.array(z.boolean()),
	z.undefined(),
]);
export const uploadSubmissionRequestSchema: RequestValidation<
	Array<DataRecord>,
	uploadSubmissionRequestQueryParams,
	categoryPathParams
> = {
	body: z.record(dataRecordValueSchema).array(),
	pathParams: categoryPathParamsSchema,
	query: z.object({ entityName: entityNameSchema, organization: organizationSchema }),
};

// ---------- Submitted Data ----------
export interface dataDeleteBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
	categoryId: string;
}
export const dataDeleteBySystemIdRequestSchema: RequestValidation<object, ParsedQs, dataDeleteBySystemIdPathParams> = {
	pathParams: z.object({ systemId: stringNotEmpty, categoryId: categoryIdSchema }),
};

export interface dataEditRequestSchemaQueryParams extends ParsedQs {
	entityName: string;
	organization: string;
}
export const dataEditRequestSchema: RequestValidation<
	Array<Record<string, unknown>>,
	dataEditRequestSchemaQueryParams,
	categoryPathParams
> = {
	body: z.record(z.unknown()).array(),
	pathParams: categoryPathParamsSchema,
	query: z.object({ entityName: entityNameSchema, organization: organizationSchema }),
};

export interface dataQueryParams extends paginationQueryParams {
	entityName?: string | string[];
	view?: string;
}
export interface getDataQueryParams extends ParsedQs {
	view?: string;
}

export const dataGetByCategoryRequestSchema: RequestValidation<object, dataQueryParams, categoryPathParams> = {
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && (data.entityName as any)?.length > 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'is incompatible with `compound` view',
					path: ['entityName'],
				});
			}
		}),
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
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && (data.entityName as any)?.length > 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'is incompatible with `compound` view',
					path: ['entityName'],
				});
			}
		}),
	pathParams: categoryOrganizationPathParamsSchema,
};

export const dataGetByQueryRequestSchema: RequestValidation<object, dataQueryParams, categoryOrganizationPathParams> = {
	body: sqonSchema,
	query: z
		.object({ entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional() })
		.merge(paginationQuerySchema),
	pathParams: categoryOrganizationPathParamsSchema,
};

export interface dataGetBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
	categoryId: string;
}
export const dataGetBySystemIdRequestSchema: RequestValidation<
	object,
	getDataQueryParams,
	dataGetBySystemIdPathParams
> = {
	query: z.object({ view: viewSchema.optional() }),
	pathParams: z.object({ systemId: stringNotEmpty, categoryId: categoryIdSchema }),
};

export const downloadDataFileTemplatesSchema = {
	query: z.object({ fileType: z.enum(['csv', 'tsv']).optional() }),
	pathParams: z.object({ categoryId: categoryIdSchema }),
};

export const validationPathParamsSchema = z.object({ categoryId: categoryIdSchema, entityName: entityNameSchema });
export interface validationPathParams extends ParamsDictionary {
	categoryId: string;
	entityName: string;
}
const validationQuerySchema = z.object({ organization: organizationSchema, value: stringNotEmpty });
export interface validationQueryParam extends ParsedQs {
	organization: string;
	value: string;
}
export const validationRequestSchema: RequestValidation<object, validationQueryParam, validationPathParams> = {
	query: validationQuerySchema,
	pathParams: validationPathParamsSchema,
};
