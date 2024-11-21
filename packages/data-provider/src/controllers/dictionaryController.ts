import { BaseDependencies } from '../config/config.js';
import dictionarySvc from '../services/dictionaryService.js';
import { validateRequest } from '../utils/requestValidation.js';
import { dictionaryRegisterRequestSchema } from '../utils/schemas.js';
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
	};
};

export default controller;
