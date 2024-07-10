import { BaseDependencies } from '../config/config.js';
import dictionarySvc from '../services/dictionaryService.js';
import { BadRequest } from '../utils/errors.js';
import { isEmptyString } from '../utils/formatUtils.js';
import { validateRequest } from '../utils/requestValidation.js';
import { registerDictionaryRequestSchema } from '../utils/schemas.js';
import { RegisterDictionaryResult } from '../utils/types.js';

const controller = (dependencies: BaseDependencies) => {
	const dictionaryService = dictionarySvc(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'DICTIONARY_CONTROLLER';
	return {
		registerDictionary: validateRequest(registerDictionaryRequestSchema, async (req, res, next) => {
			try {
				const categoryName = req.body.categoryName;
				const dictionaryName = req.body.dictionaryName;
				const dictionaryVersion = req.body.version;

				logger.info(
					LOG_MODULE,
					`Register Dictionary Request categoryName '${categoryName}' name '${dictionaryName}' version '${dictionaryVersion}'`,
				);

				if (isEmptyString(categoryName)) {
					throw new BadRequest('Request is missing `categoryName` parameter.');
				}
				if (isEmptyString(dictionaryName)) {
					throw new BadRequest('Request is missing `dictionaryName` parameter.');
				}
				if (isEmptyString(dictionaryVersion)) {
					throw new BadRequest('Request is missing `version` parameter.');
				}

				const { dictionary, category } = await dictionaryService.register(
					categoryName,
					dictionaryName,
					dictionaryVersion,
				);

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
	};
};

export default controller;
