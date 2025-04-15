import { BaseDependencies } from '../config/config.js';
import validationService from '../services/validationService.js';
import { ValidationError } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { validationRequestSchema1 } from '../utils/schemas.js';

const controller = (dependencies: BaseDependencies) => {
	const { logger } = dependencies;
	const LOG_MODULE = 'VALIDATION_CONTROLLER';
	const validationSvc = validationService(dependencies);

	return {
		validateRecord: validateRequest(validationRequestSchema1, async (req, res, next) => {
			try {
				const { categoryId, entityName } = req.params;
				const { studyId, value } = req.query;

				logger.info(
					LOG_MODULE,
					'Validation Request',
					JSON.stringify({
						categoryId,
						entityName,
						studyId,
						value,
					}),
				);

				const isValid = await validationSvc.validateRecord({
					categoryId: Number(categoryId),
					entityName,
					studyId,
					value,
				});

				if (!isValid) {
					throw new ValidationError('INVALID_VALUE', 'The specified value was not found.');
				}

				return res.status(200).send();
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
