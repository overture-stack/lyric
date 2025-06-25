import { NextFunction, Request, Response } from 'express';
import JSZip from 'jszip';
import dictionaryService from 'src/services/dictionaryService.js';

import { createDataFileTemplate } from '@overture-stack/lectern-client';

import { BaseDependencies } from '../config/config.js';
import categorySvc from '../services/categoryService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { cagegoryDetailsRequestSchema, downloadDataFileTemplatesSchema } from '../utils/schemas.js';

const controller = (dependencies: BaseDependencies) => {
	const categoryService = categorySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'CATEGORY_CONTROLLER';
	const service = dictionaryService(dependencies);
	return {
		getDetails: validateRequest(cagegoryDetailsRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);

				logger.info(LOG_MODULE, 'Request Get Category Details', `categoryId '${categoryId}'`);

				const details = await categoryService.getDetails(categoryId);

				if (!details) {
					throw new BadRequest('Category not found');
				}
				return res.send(details);
			} catch (error) {
				next(error);
			}
		}),
		listAll: async (req: Request, res: Response, next: NextFunction) => {
			try {
				logger.info(LOG_MODULE, `List All Categories request`);

				const categoryList = await categoryService.listAll();
				return res.send(categoryList);
			} catch (error) {
				next(error);
			}
		},

		downloadDataFileTemplates: validateRequest(
			downloadDataFileTemplatesSchema,
			async (req: Request, res: Response, next: NextFunction) => {
				try {
					const { name, version, fileType } = downloadDataFileTemplatesSchema.query.parse(req.query);

					const dictionary = await service.fetchDictionaryByVersion(name, version);

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
			},
		),
		getDictionaryJson: async (req: Request, res: Response, next: NextFunction) => {
			try {
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

				const dictionary = await service.getOneById(numericDictId);
				const formattedDictionary = await service.fetchDictionaryByVersion(dictionary.name, dictionary.version);

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
