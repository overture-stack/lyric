import { z } from 'zod';

export const registerDictionaryBodyRequestSchema = z.object({
	categoryName: z.string(),
	dictionaryName: z.string(),
	version: z.string(),
});

export const uploadSubmissionBodyRequestSchema = z.object({
	organization: z.string(),
});

export const uploadSubmissionFileRequestSchema = z.object({
	files: z
		.custom<Express.Multer.File[]>()
		.refine((files) => files?.length > 0, 'required as a .tsv format')
		.refine((files) => files.every((file) => file.originalname.match(/.*\.tsv$/)), 'required as a .tsv format'),
});

const numberSchema = z
	.custom<number>()
	.refine((value) => value ?? false, 'required')
	.refine((value) => Number.isFinite(Number(value)), 'an invalid number')
	.transform((value) => Number(value));

export const uploadSubmissionPathParamsRequestSchema = z.object({
	categoryId: numberSchema,
});

export const activeSubmissionRequestSchema = z.object({
	categoryId: numberSchema,
});

export const commitSubmissionRequestSchema = z.object({
	categoryId: numberSchema,
	id: numberSchema,
});
