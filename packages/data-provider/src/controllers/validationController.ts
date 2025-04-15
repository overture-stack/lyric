import { BaseDependencies } from '../config/config.js';
import validationService from '../services/validationService.js';
import { BadRequest } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { validationRequestSchema } from '../utils/schemas.js';

const controller = (dependencies: BaseDependencies) => {
	const { logger } = dependencies;
	const LOG_MODULE = 'VALIDATION_CONTROLLER';
	const validationSvc = validationService(dependencies);

	return {
		validateRecord: validateRequest(validationRequestSchema, async (req, res, next) => {
			try {
				const { categoryId, entityName, organization } = req.params;
				const { field, value } = req.query;

				logger.info(
					LOG_MODULE,
					'Validation Request',
					`categoryId '${categoryId}'`,
					`entityName '${entityName}'`,
					`field '${field}'`,
					`organization '${organization}'`,
					`value '${value}'`,
				);

				const isValid = await validationSvc.validateRecord({
					categoryId: Number(categoryId),
					entityName,
					field,
					organization,
					value,
				});

				if (!isValid) {
					throw new BadRequest('The specified value was not found.');
				}

				return res.status(200).send({
					message: 'Validation passed',
				});
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
