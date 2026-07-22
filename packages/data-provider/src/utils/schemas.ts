import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z as zod } from 'zod';

import type { DataRecord } from '@overture-stack/lectern-client';
import type { SQON } from '@overture-stack/sqon-builder';

import { isAuditEventValid, isSubmissionActionTypeValid } from './auditUtils.js';
import { parseSQON } from './convertSqonToQuery.js';
import { isValidCategoryAlias, isValidDateFormat, isValidIdNumber } from './formatUtils.js';
import { RequestValidation } from './requestValidation.js';
import { VIEW_TYPE } from './types.js';

const auditEventTypeSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => isAuditEventValid(value), 'invalid Event Type');

const booleanSchema = zod
	.string()
	.toLowerCase()
	.refine((value) => value === 'true' || value === 'false');

const viewSchema = zod.string().toLowerCase().trim().min(1).pipe(VIEW_TYPE);

// Accepts a numeric category id or an alias; matched by equality downstream, not shape, so a
// numeric-looking alias is fine.
const categoryIdSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidIdNumber(parseInt(value)) || isValidCategoryAlias(value), 'invalid category ID');

const categoryAliasSchema = zod
	.string()
	.trim()
	.refine((value) => value === '' || isValidCategoryAlias(value), 'alias must contain only letters, numbers, hyphens, and underscores');

const endDateSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'invalid `endDate` parameter');

const entityNameSchema = zod.string().trim().min(1);

const organizationSchema = zod.string().trim().min(1);

const pageSizeSchema = zod.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) {
		ctx.addIssue({
			code: zod.ZodIssueCode.invalid_type,
			expected: 'number',
			received: 'nan',
		});
	}

	if (parsed < 1) {
		ctx.addIssue({
			code: zod.ZodIssueCode.too_small,
			minimum: 1,
			inclusive: true,
			type: 'number',
		});
	}
});

const indexIntegerSchema = zod.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) {
		ctx.addIssue({
			code: zod.ZodIssueCode.invalid_type,
			expected: 'number',
			received: 'nan',
		});
	}
});

const positiveInteger = zod.string().superRefine((value, ctx) => {
	const parsed = parseInt(value);
	if (isNaN(parsed)) {
		ctx.addIssue({
			code: zod.ZodIssueCode.invalid_type,
			expected: 'number',
			received: 'nan',
		});
	}

	if (parsed < 1) {
		ctx.addIssue({
			code: zod.ZodIssueCode.too_small,
			minimum: 1,
			inclusive: true,
			type: 'number',
		});
	}
});

const sqonSchema = zod.custom<SQON>((value) => {
	try {
		parseSQON(value);
		return true;
	} catch (error) {
		return false;
	}
}, 'invalid SQON format');

const startDateSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => isValidDateFormat(value), 'invalid `startDate` parameter');

const submissionActionTypeSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => isSubmissionActionTypeValid(value), 'invalid Submission Action Type');

const submissionIdSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'invalid submission ID');

const migrationIdSchema = zod
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		const parsed = parseInt(value);
		return isValidIdNumber(parsed);
	}, 'invalid migration ID');

const stringNotEmpty = zod.string().trim().min(1);

// Common Category Path Params
export interface CategoryPathParams extends ParamsDictionary {
	categoryId: string;
}

export const categoryPathParamsSchema = zod.object({
	categoryId: categoryIdSchema,
});

// Common Category and Organization Path Params
export const categoryOrganizationPathParamsSchema = zod.object({
	categoryId: categoryIdSchema,
	organization: organizationSchema,
});
export type CategoryOrganizationPathParams = zod.infer<typeof categoryOrganizationPathParamsSchema>;

// Common Category, Organization, and EntityName Path Params
export const categoryOrganizationEntityPathParamsSchema = zod.object({
	categoryId: categoryIdSchema,
	organizationId: organizationSchema,
	entityName: entityNameSchema,
});
export type CategoryOrganizationEntityPathParams = zod.infer<typeof categoryOrganizationEntityPathParamsSchema>;

// Common Submission Path Params

export interface submissionIdPathParam extends ParamsDictionary {
	submissionId: string;
}

const submissionIdPathParamSchema = zod.object({
	submissionId: submissionIdSchema,
});

// Common Migration Path Params
export interface migrationIdPathParam extends ParamsDictionary {
	migrationId: string;
}

const migrationIdPathParamSchema = zod.object({
	migrationId: migrationIdSchema,
});

// Common Pagination Query Params

export interface PaginationQueryParams extends ParsedQs {
	page?: string;
	pageSize?: string;
}

const paginationQuerySchema = zod.object({
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

const auditQuerySchema = zod
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
	alias?: string;
	categoryName: string;
	defaultCentricEntity?: string;
	dictionaryName: string;
	dictionaryVersion: string;
}

export interface DictionaryRegisterQueryParams extends ParsedQs {
	force?: string;
}

export const dictionaryRegisterRequestSchema: RequestValidation<
	DictionaryRegisterBodyParams,
	DictionaryRegisterQueryParams,
	ParamsDictionary
> = {
	body: zod.object({
		alias: categoryAliasSchema.optional(),
		categoryName: stringNotEmpty,
		defaultCentricEntity: entityNameSchema.or(zod.literal('')).optional(),
		dictionaryName: stringNotEmpty,
		dictionaryVersion: stringNotEmpty,
	}),
	query: zod.object({
		force: booleanSchema.default('false'),
	}),
};

// Migration Requests
export const migrationByIdRequestSchema: RequestValidation<object, ParsedQs, migrationIdPathParam> = {
	pathParams: migrationIdPathParamSchema,
};

export const migrationsByCategoryIdRequestSchema: RequestValidation<object, PaginationQueryParams, CategoryPathParams> =
	{
		pathParams: categoryPathParamsSchema,
		query: paginationQuerySchema,
	};

export interface MigrationDataQueryParams extends PaginationQueryParams {
	entityNames?: string | string[];
	organizations?: string | string[];
	isInvalid?: string;
}

export const migrationDataRequestSchema: RequestValidation<object, MigrationDataQueryParams, migrationIdPathParam> = {
	pathParams: migrationIdPathParamSchema,
	query: zod
		.object({
			entityNames: zod.union([entityNameSchema, entityNameSchema.array()]).optional(),
			organizations: zod.union([organizationSchema, organizationSchema.array()]).optional(),
			isInvalid: booleanSchema.default('false'),
		})
		.merge(paginationQuerySchema),
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
	query: zod.object({
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
	query: zod
		.object({
			entityNames: zod.union([entityNameSchema, entityNameSchema.array()]).optional(),
			actionTypes: zod.union([submissionActionTypeSchema, submissionActionTypeSchema.array()]).optional(),
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
	pathParams: zod.object({
		categoryId: categoryIdSchema,
		submissionId: submissionIdSchema,
	}),
};

export interface SubmissionDeleteQueryParams extends ParsedQs {
	force?: string;
}

export const submissionDeleteRequestSchema: RequestValidation<
	object,
	SubmissionDeleteQueryParams,
	submissionIdPathParam
> = {
	pathParams: submissionIdPathParamSchema,
	query: zod.object({
		force: booleanSchema.default('false'),
	}),
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
	query: zod.object({
		entityName: entityNameSchema,
		index: indexIntegerSchema.optional(),
	}),
	pathParams: zod.object({
		actionType: submissionActionTypeSchema,
		submissionId: submissionIdSchema,
	}),
};

const uploadSubmissionQueryParams = zod.object({
	entityName: entityNameSchema,
	organization: organizationSchema,
});

export type UploadSubmissionQueryParams = zod.infer<typeof uploadSubmissionQueryParams>;

const submissionUploadFilesQueryParams = zod.object({
	organization: organizationSchema,
	sync: zod.enum(['true', 'false']).optional(),
});

export type SubmissionUploadFilesQueryParams = zod.infer<typeof submissionUploadFilesQueryParams>;

export const filenameEntityPair = zod.object({
	filename: zod.string(),
	entity: zod.string(),
});

export type FilenameEntityPair = zod.infer<typeof filenameEntityPair>;

const dataRecordValueSchema = zod.union([
	zod.string(),
	zod.number(),
	zod.boolean(),
	zod.array(zod.string()),
	zod.array(zod.number()),
	zod.array(zod.boolean()),
	zod.undefined(),
]);

const dataRecordSchema = zod.record(dataRecordValueSchema);

export const uploadSubmissionRequestSchema: RequestValidation<
	FilenameEntityPair[] | undefined,
	SubmissionUploadFilesQueryParams,
	CategoryPathParams
> = {
	pathParams: categoryPathParamsSchema,
	query: submissionUploadFilesQueryParams,
	// Multer populates req.body with string-valued form fields from multipart requests.
	// When fileEntityMap is sent as a JSON-encoded form field, req.body is { fileEntityMap: '...' }.
	// When no text fields are sent, req.body is an empty null-prototype object {}.
	// The preprocess step extracts and parses the fileEntityMap field when present,
	// and coerces all other values (empty object, non-array) to undefined.
	body: zod.preprocess((value: unknown) => {
		if (Array.isArray(value)) {
			return value;
		}
		if (typeof value !== 'string') {
			return undefined;
		}

		try {
			const parsed: unknown = JSON.parse(value);

			// The value provided by Swagger will be an array encoded as a string, where and the content
			// of that array may be either JSON objects, or stringified JSON objects. We will accomodate
			// an input of either form since the formatting is ambiguous. In particular, the swagger interface
			// will stringify each element of the array so we require the extra type check inside the map over
			// the parsed input, but a developer may want to simply build the entire array and then stringify
			// the entire thing. Both are reasonable.
			return Array.isArray(parsed)
				? parsed.map((item) => (typeof item === 'string' ? JSON.parse(item) : item))
				: [parsed];
		} catch {
			return undefined;
		}
	}, zod.array(filenameEntityPair).optional()),
};

export const uploadSingleEntitySubmissionDataRequestSchema: RequestValidation<
	Array<DataRecord>,
	UploadSubmissionQueryParams,
	CategoryPathParams
> = {
	body: dataRecordSchema.array(),
	query: uploadSubmissionQueryParams,
	pathParams: categoryPathParamsSchema,
};

// Submitted Data

export interface DataDeleteBySystemIdPathParams extends ParamsDictionary {
	systemId: string;
	categoryId: string;
}

export const dataDeleteBySystemIdRequestSchema: RequestValidation<object, ParsedQs, DataDeleteBySystemIdPathParams> = {
	pathParams: zod.object({
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
	UploadSubmissionQueryParams,
	CategoryPathParams
> = {
	body: zod.record(zod.unknown()).array(),
	query: uploadSubmissionQueryParams,
	pathParams: categoryPathParamsSchema,
};

export interface DataQueryParams extends PaginationQueryParams {
	entityName?: string | string[];
	view?: string;
}

export interface GetDataQueryParams extends ParsedQs {
	view?: string;
}

export const dataGetByCategoryRequestSchema: RequestValidation<object, DataQueryParams, CategoryPathParams> = {
	query: zod
		.object({
			entityName: zod.union([entityNameSchema, entityNameSchema.array()]).optional(),
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && data.entityName?.length > 0) {
				ctx.addIssue({
					code: zod.ZodIssueCode.custom,
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
	query: zod
		.object({
			entityName: zod.union([entityNameSchema, entityNameSchema.array()]).optional(),
			view: viewSchema.optional(),
		})
		.merge(paginationQuerySchema)
		.superRefine((data, ctx) => {
			if (data.view === VIEW_TYPE.Values.compound && data.entityName && data.entityName?.length > 0) {
				ctx.addIssue({
					code: zod.ZodIssueCode.custom,
					message: 'is incompatible with `compound` view',
					path: ['entityName'],
				});
			}
		}),
	pathParams: categoryOrganizationPathParamsSchema,
};

export const dataGetByQueryRequestSchema: RequestValidation<object, DataQueryParams, CategoryOrganizationPathParams> = {
	body: sqonSchema,
	query: zod
		.object({
			entityName: zod.union([entityNameSchema, entityNameSchema.array()]).optional(),
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
	query: zod.object({
		view: viewSchema.optional(),
	}),
	pathParams: zod.object({
		systemId: stringNotEmpty,
		categoryId: categoryIdSchema,
	}),
};

export const downloadDataFileTemplatesSchema = {
	query: zod.object({
		fileType: zod.enum(['csv', 'tsv']).optional(),
	}),
	pathParams: zod.object({
		categoryId: categoryIdSchema,
	}),
};
export const validationPathParamsSchema = zod.object({
	categoryId: categoryIdSchema,
	entityName: entityNameSchema,
});

export interface ValidationPathParams extends ParamsDictionary {
	categoryId: string;
	entityName: string;
}

const validationQuerySchema = zod.object({
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
