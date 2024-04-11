import { z } from 'zod';

const numberSchema = z
	.custom<number>()
	.refine((value) => value ?? false, 'required')
	.refine((value) => Number.isFinite(Number(value)), 'an invalid number')
	.transform((value) => Number(value));

export const uploadCustomFile = z
	.custom<Express.Multer.File[]>()
	.refine((files) => files?.length > 0, 'required as a .tsv format')
	.refine((files) => files.every((file) => file.originalname.match(/.*\.tsv$/)), 'required as a .tsv format');

export const registerDictionaryRequestSchema = {
	body: z.object({
		categoryName: z.string(),
		dictionaryName: z.string(),
		version: z.string(),
	}),
};

export const uploadSubmissionRequestSchema = {
	body: z.object({
		organization: z.string(),
	}),
	params: z.object({
		categoryId: numberSchema,
	}),
	files: z.object({
		files: uploadCustomFile,
	}),
};

export const activeSubmissionRequestSchema = {
	params: z.object({
		categoryId: numberSchema,
	}),
};

export const commitSubmissionRequestSchema = {
	params: z.object({
		categoryId: numberSchema,
		id: numberSchema,
	}),
};
