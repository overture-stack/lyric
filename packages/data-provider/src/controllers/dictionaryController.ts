import type { NextFunction, Request, Response } from 'express';
import JSZip from 'jszip';

import { createDataFileTemplate } from '@overture-stack/lectern-client';

import { BaseDependencies } from '../config/config.js';
import dictionarySvc from '../services/dictionaryService.js';
import { NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { dictionaryRegisterRequestSchema } from '../utils/schemas.js';
import { downloadDataFileTemplatesSchema } from '../utils/schemas.js';
import { RegisterDictionaryResult } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const dictionaryService = dictionarySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'DICTIONARY_CONTROLLER';

	return {
		registerDictionary: validateRequest(dictionaryRegisterRequestSchema, async (req, res, next) => {
			try {
				const categoryName: string = String(req.body.categoryName).trim();
				const dictionaryName: string = String(req.body.dictionaryName).trim();
				// Must match Lectern exactly, e.g. "1.0"
				const dictionaryVersion: string = String(req.body.dictionaryVersion).trim();

				// Schema allows union: string | string[] | undefined
				const rawDce: string | string[] | undefined = req.body.defaultCentricEntity;

				// Normalize to string | undefined (service expects string)
				let defaultCentricEntity: string | undefined;
				if (Array.isArray(rawDce)) {
					const firstNonEmpty = rawDce.map((s) => String(s).trim()).find((s) => s.length > 0);
					defaultCentricEntity = firstNonEmpty || undefined;
				} else if (typeof rawDce === 'string') {
					const t = rawDce.trim();
					defaultCentricEntity = t.length > 0 ? t : undefined;
				} else {
					defaultCentricEntity = undefined;
				}

				logger.info(
					LOG_MODULE,
					`Register Dictionary Request categoryName '${categoryName}' name '${dictionaryName}' version '${dictionaryVersion}'`,
				);

				const { dictionary, category } = await dictionaryService.register({
					categoryName,
					dictionaryName,
					dictionaryVersion,
					defaultCentricEntity,
				});

				logger.info(LOG_MODULE, `Register Dictionary completed!`);

				const result: RegisterDictionaryResult = {
					categoryId: category.id,
					categoryName: category.name,
					dictionary: dictionary.dictionary,
					name: dictionary.name,
					version: dictionary.version,
				};
				return res.send(result);
			} catch (error) {
				next(error);
			}
		}),

		downloadDataFileTemplates: validateRequest(downloadDataFileTemplatesSchema, async (req, res, next) => {
			try {
				const { fileType } = req.query;
				const categoryId = Number(req.params.categoryId);

				const dictionary = await dictionaryService.getActiveDictionaryByCategory(categoryId);

				if (!dictionary) {
					throw new NotFound(`Dictionary with categoryId "${categoryId}" not found.`);
				}

				const zip = new JSZip();
				for (const schema of dictionary.dictionary || []) {
					const template = createDataFileTemplate(schema, fileType ? { fileType } : undefined);
					zip.file(template.fileName, template.content);
				}

				const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

				res.set({
					'Content-Disposition': `attachment; filename=${dictionary.name}_${categoryId}_templates.zip`,
					'Content-Type': 'application/zip',
				});

				return res.status(200).send(zipContent);
			} catch (error) {
				logger.error(LOG_MODULE, 'Error generating dictionary templates', error);
				next(error);
			}
		}),

		getDictionaryJson: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryId = Number(req.params.categoryId);

				const dictionary = await dictionaryService.getActiveDictionaryByCategory(categoryId);
				if (!dictionary) {
					throw new NotFound(`Dictionary with categoryId "${categoryId}" not found.`);
				}
				const formattedDictionary = await dictionaryService.fetchDictionaryByVersion(
					dictionary.name,
					dictionary.version,
				);

				return res.send(formattedDictionary);
			} catch (error) {
				logger.error(LOG_MODULE, 'Error fetching schema', error);
				next(error);
			}
		},
	};
};

export default controller;
