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
	.refine((value) => isAuditEventValid(value), 'invalid Event Type');

const booleanSchema = z
	.string()
	.toLowerCase()
	.refine((value) => value === 'true' || value === 'false');

const viewSchema = z.string().toLowerCase().trim().min(1).pipe(VIEW_TYPE);

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
export interface CategoryPathParams extends ParamsDictionary {
	categoryId: string;
}

export const categoryPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
});

// Common Category and Organization Path Params
export const categoryOrganizationPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
	organization: organizationSchema,
});
export type CategoryOrganizationPathParams = z.infer<typeof categoryOrganizationPathParamsSchema>;

// Common Category, Organization, and EntityName Path Params
export const categoryOrganizationEntityPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
	organizationId: organizationSchema,
	entityName: entityNameSchema,
});
export type CategoryOrganizationEntityPathParams = z.infer<typeof categoryOrganizationEntityPathParamsSchema>;

// Common Submission Path Params

export interface submissionIdPathParam extends ParamsDictionary {
	submissionId: string;
}

const submissionIdPathParamSchema = z.object({
	submissionId: submissionIdSchema,
});

// Common Pagination Query Params

export interface PaginationQueryParams extends ParsedQs {
	page?: string;
	pageSize?: string;
}

const paginationQuerySchema = z.object({
	page: positiveInteger.optional(),
	pageSize: pageSizeSchema.optional(),
});

// Audit Request

export interface AuditQueryParams extends ParsedQs {
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
	PaginationQueryParams & AuditQueryParams,
	CategoryOrganizationPathParams
> = {
	query: auditQuerySchema,
	pathParams: categoryOrganizationPathParamsSchema,
};

// Category Request

export const categoryDetailsRequestSchema: RequestValidation<object, ParsedQs, CategoryPathParams> = {
	pathParams: categoryPathParamsSchema,
};

// Dictionary Request

export interface DictionaryRegisterBodyParams {
	categoryName: string;
	dictionaryName: string;
	dictionaryVersion: string;
	defaultCentricEntity?: string;
}

export const dictionaryRegisterRequestSchema: RequestValidation<
	DictionaryRegisterBodyParams,
	ParsedQs,
	ParamsDictionary
> = {
	body: z.object({
		categoryName: stringNotEmpty,
		dictionaryName: stringNotEmpty,
		dictionaryVersion: stringNotEmpty,
		defaultCentricEntity: entityNameSchema.or(z.literal('')).optional(),
	}),
};

// Submission Requests

export interface SubmissionsByCategoryQueryParams extends PaginationQueryParams {
	onlyActive?: string;
	organization?: string;
	username?: string;
}

export const submissionsByCategoryRequestSchema: RequestValidation<
	object,
	SubmissionsByCategoryQueryParams,
	CategoryPathParams
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
export interface SubmissionsDetailsQueryParams extends PaginationQueryParams {
	entityNames?: string | string[];
	actionTypes?: string | string[];
}

export const submissionDetailsRequestSchema: RequestValidation<
	object,
	SubmissionsDetailsQueryParams,
	submissionIdPathParam
> = {
	query: z
		.object({
			entityNames: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
			actionTypes: z.union([submissionActionTypeSchema, submissionActionTypeSchema.array()]).optional(),
		})
		.merge(paginationQuerySchema),
	pathParams: submissionIdPathParamSchema,
};

export const submissionActiveByOrganizationRequestSchema: RequestValidation<
	object,
	ParsedQs,
	CategoryOrganizationPathParams
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

export interface SubmissionDeleteEntityNameParams extends ParamsDictionary {
	actionType: string;
	submissionId: string;
}

export interface SubmissionDeleteEntityNameQueryParams extends ParsedQs {
	entityName: string;
	index?: string;
}

export const submissionDeleteEntityNameRequestSchema: RequestValidation<
	object,
	SubmissionDeleteEntityNameQueryParams,
	SubmissionDeleteEntityNameParams
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

export type UploadSubmissionPathParams = {
	organizationId: string;
	categoryId: string;
};

export const filenameEntityPair = z.object({
	filename: z.string(),
	entity: z.string(),
});

export type FilenameEntityPair = z.infer<typeof filenameEntityPair>;

const dataRecordValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string()),
	z.array(z.number()),
	z.array(z.boolean()),
	z.undefined(),
]);

const dataRecordSchema = z.record(dataRecordValueSchema);

export const uploadSubmissionRequestSchema: RequestValidation<
	unknown,
	Record<string, never>,
	UploadSubmissionPathParams
> = {
	pathParams: z.object({
		categoryId: categoryIdSchema,
		organizationId: organizationSchema,
	}),
	// body: z.array(filenameEntityPair).optional(),
};

export const uploadSingleEntitySubmissionDataRequestSchema: RequestValidation<
	Array<DataRecord>,
	Record<string, never>,
	CategoryOrganizationEntityPathParams
> = {
	body: dataRecordSchema.array(),
	pathParams: categoryOrganizationEntityPathParamsSchema,
};

// Submitted Data

export interface DataDeleteBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
	categoryId: string;
}

export const dataDeleteBySystemIdRequestSchema: RequestValidation<object, ParsedQs, DataDeleteBySystemIdPathParams> = {
	pathParams: z.object({
		systemId: stringNotEmpty,
		categoryId: categoryIdSchema,
	}),
};

export interface DataEditRequestSchemaQueryParams extends ParsedQs {
	entityName: string;
	organization: string;
}

// TODO: Need type validation for the edit request schema
export const editSingleEntityRequestSchema: RequestValidation<
	Array<Record<string, unknown>>,
	Record<string, never>,
	CategoryOrganizationEntityPathParams
> = {
	body: z.record(z.unknown()).array(),
	pathParams: categoryOrganizationEntityPathParamsSchema,
};

export interface DataQueryParams extends PaginationQueryParams {
	entityName?: string | string[];
	view?: string;
}

export interface GetDataQueryParams extends ParsedQs {
	view?: string;
}

export const dataGetByCategoryRequestSchema: RequestValidation<object, DataQueryParams, CategoryPathParams> = {
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && data.entityName?.length > 0) {
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
	DataQueryParams,
	CategoryOrganizationPathParams
> = {
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && data.entityName?.length > 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'is incompatible with `compound` view',
					path: ['entityName'],
				});
			}
		}),
	pathParams: categoryOrganizationPathParamsSchema,
};

export const dataGetByQueryRequestSchema: RequestValidation<object, DataQueryParams, CategoryOrganizationPathParams> = {
	body: sqonSchema,
	query: z
		.object({
			entityName: z.union([entityNameSchema, entityNameSchema.array()]).optional(),
		})
		.merge(paginationQuerySchema),
	pathParams: categoryOrganizationPathParamsSchema,
};

export interface DataGetBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
	categoryId: string;
}

export const DataGetBySystemIdRequestSchema: RequestValidation<
	object,
	GetDataQueryParams,
	DataGetBySystemIdPathParams
> = {
	query: z.object({
		view: viewSchema.optional(),
	}),
	pathParams: z.object({
		systemId: stringNotEmpty,
		categoryId: categoryIdSchema,
	}),
};

export const downloadDataFileTemplatesSchema = {
	query: z.object({
		fileType: z.enum(['csv', 'tsv']).optional(),
	}),
	pathParams: z.object({
		categoryId: categoryIdSchema,
	}),
};
export const validationPathParamsSchema = z.object({
	categoryId: categoryIdSchema,
	entityName: entityNameSchema,
});

export interface ValidationPathParams extends ParamsDictionary {
	categoryId: string;
	entityName: string;
}

const validationQuerySchema = z.object({
	organization: organizationSchema,
	value: stringNotEmpty,
});
export interface ValidationQueryParam extends ParsedQs {
	organization: string;
	value: string;
}

export const validationRequestSchema: RequestValidation<object, ValidationQueryParam, ValidationPathParams> = {
	query: validationQuerySchema,
	pathParams: validationPathParamsSchema,
};
