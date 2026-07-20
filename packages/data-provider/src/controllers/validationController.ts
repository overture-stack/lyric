import { BaseDependencies, type ValidatorConfig } from '../config/config.js';
import validationService from '../services/validationService.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import { validationRequestSchema } from '../utils/schemas.js';
import { findValidatorEntry } from '../utils/validator.js';

const controller = ({
	baseDependencies,
	validatorConfig,
}: {
	baseDependencies: BaseDependencies;
	validatorConfig: ValidatorConfig;
}) => {
	const validationSvc = validationService(baseDependencies);

	return {
		existsRecord: validateRequest(validationRequestSchema, async (req, res, next) => {
			try {
				const { categoryId, entityName } = req.params;
				const { organization, value } = req.query;

				// check if validator is enabled for this category, and entity name
				const validatorEntry = findValidatorEntry({ validatorConfig, categoryId, entityName });

				if (!validatorEntry) {
					throw new BadRequest(
						`Validation is not enabled for categoryId '${categoryId}' and entityName '${entityName}'`,
					);
				}

				const isValid = await validationSvc.existsRecord({
					categoryId: Number(categoryId),
					entityName,
					field: validatorEntry.fieldName,
					organization,
					value,
				});

				if (!isValid) {
					throw new NotFound('The specified value was not found.');
				}

				return res.status(200).json({
					message: 'Record found',
				});
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
