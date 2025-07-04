import type { NextFunction, Request, Response } from 'express';
import JSZip from 'jszip';

import { createDataFileTemplate } from '@overture-stack/lectern-client';

import { BaseDependencies } from '../config/config.js';
import dictionarySvc from '../services/dictionaryService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
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
				const categoryName = req.body.categoryName;
				const dictionaryName = req.body.dictionaryName;
				const dictionaryVersion = req.body.dictionaryVersion;
				const defaultCentricEntity = req.body.defaultCentricEntity;

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
				const { name, version, fileType } = downloadDataFileTemplatesSchema.query.parse(req.query);

				const dictionary = await dictionaryService.fetchDictionaryByVersion(name, version);

				if (!dictionary) {
					throw new NotFound(`Dictionary with name "${name}" and version "${version}" not found.`);
				}

				const zip = new JSZip();
				for (const schema of dictionary.schemas || []) {
					const template = createDataFileTemplate(schema, fileType ? { fileType } : undefined);
					zip.file(template.fileName, template.content);
				}

				const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

				res.set({
					'Content-Disposition': `attachment; filename=${name}_${version}_templates.zip`,
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
				const { dictId, schemaName } = req.params;

				if (!dictId) {
					throw new BadRequest('Request is missing `dictId` parameter.');
				}
				if (!schemaName) {
					throw new BadRequest('Request is missing `schemaName` parameter.');
				}

				const numericDictId = parseInt(dictId, 10);

				if (isNaN(numericDictId)) {
					throw new BadRequest("'dictId' must be a valid number");
				}

				const dictionary = await dictionaryService.getActiveDictionaryByCategory(categoryId);
				if (!dictionary) {
					throw new NotFound(`Dictionary with categoryId "${categoryId}" not found.`);
				}
				const formattedDictionary = await dictionaryService.fetchDictionaryByVersion(
					dictionary.name,
					dictionary.version,
				);

				const schema = formattedDictionary.schemas.find((schema: { name: string }) => schema.name === schemaName);

				if (!schema) {
					throw new NotFound(
						`Dictionary '${dictionary.name} ${dictionary.version}' does not have a schema named '${schemaName}'`,
					);
				}

				return res.send(schema);
			} catch (error) {
				logger.error(LOG_MODULE, 'Error fetching schema', error);
				next(error);
			}
		},
	};
};

export default controller;
