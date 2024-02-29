import { NextFunction, Request, Response } from 'express';

import { Dependencies } from '../config/config.js';
import dictionaryService from '../services/dictionaryService.js';
import { BadRequest } from '../utils/errors.js';

const controller = (dependencies: Dependencies) => {
	const service = dictionaryService(dependencies);
	return {
		getCurrentDictionary: async (req: Request, res: Response) => {
			// const currentDictionary = await dictionaryService.getCurrentDictionary();
			// res.send(currentDictionary);
			res.status(200).send();
		},

		registerDictionary: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { logger } = dependencies;

				const categoryName = req.body.categoryName;
				const dictionaryName = req.body.dictionaryName;
				const dictionaryVersion = req.body.version;

				logger.info(
					`[Register Dictionary] Request: categoryName:${categoryName} dictionaryName:${dictionaryName} dictionaryVersion:${dictionaryVersion}`,
				);

				if (!categoryName) throw new BadRequest('Request is missing `categoryName` parameter.');
				if (!dictionaryName) throw new BadRequest('Request is missing `dictionaryName` parameter.');
				if (!dictionaryVersion) throw new BadRequest('Request is missing `version` parameter.');

				const registered = await service.registerDictionary(categoryName, dictionaryName, dictionaryVersion);
				logger.info(`[Register Dictionary] completed!`);
				return res.send(registered);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
