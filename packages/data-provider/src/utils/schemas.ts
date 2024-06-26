import { z } from 'zod';
import { RequestValidation } from './requestValidation.js';

const numberSchema = z
	.custom<number>()
	.refine((value) => value ?? false, 'required')
	.refine((value) => Number.isFinite(Number(value)), 'an invalid number')
	.transform((value) => Number(value));

export const uploadCustomFile = z
	.custom<Express.Multer.File[]>()
	.refine((files) => files?.length > 0, 'required as a .tsv format')
	.refine((files) => files.every((file) => file.originalname.match(/.*\.tsv$/)), 'required as a .tsv format');

export const registerDictionaryRequestSchema: RequestValidation<any> = {
	body: z.object({
		categoryName: z.string(),
		dictionaryName: z.string(),
		version: z.string(),
	}),
};

// params can be only validated as strings to match ParamsDictionary
export const uploadSubmissionRequestSchema: RequestValidation<any> = {
	body: z.object({
		organization: z.string(),
	}),
};
