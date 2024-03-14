import { NextFunction, Request, Response } from 'express';

import { Dependencies } from '../config/config.js';
import dictionarySvc from '../services/dictionaryService.js';
import { BadRequest, NotImplemented } from '../utils/errors.js';

const controller = (dependencies: Dependencies) => {
	const dictionaryService = dictionarySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'DICTIONARY_CONTROLLER';
	return {
		getCurrentDictionary: async (req: Request, res: Response, next: NextFunction) => {
			try {
				//TODO: implement logic to get current dictionary from DB
				throw new NotImplemented();
			} catch (error) {
				next(error);
			}
		},

		registerDictionary: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const categoryName = req.body.categoryName;
				const dictionaryName = req.body.dictionaryName;
				const dictionaryVersion = req.body.version;

				logger.info(
					LOG_MODULE,
					`Register Dictionary Request categoryName '${categoryName}' name '${dictionaryName}' version '${dictionaryVersion}'`,
				);

				if (!categoryName) throw new BadRequest('Request is missing `categoryName` parameter.');
				if (!dictionaryName) throw new BadRequest('Request is missing `dictionaryName` parameter.');
				if (!dictionaryVersion) throw new BadRequest('Request is missing `version` parameter.');

				const registered = await dictionaryService.register(categoryName, dictionaryName, dictionaryVersion);
				logger.info(LOG_MODULE, `Register Dictionary completed!`);
				return res.send(registered);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
