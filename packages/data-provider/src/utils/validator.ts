import type { ValidatorConfig, ValidatorEntry } from '../config/config.js';

/**
 * Finds a matching validator configuration entry based on the provided 'categoryId' and 'entityName
 * @param params
 * @param params.validatorConfig - The list of all configured validator entries.
 * @param params.categoryId - The category ID to match.
 * @param params.entityName - The entity name to match.
 * @returns
 */
export const findValidatorEntry = ({
	validatorConfig,
	categoryId,
	entityName,
}: {
	validatorConfig: ValidatorConfig;
	categoryId: string;
	entityName: string;
}): ValidatorEntry | undefined => {
	return validatorConfig.find(
		(config) => config.categoryId.toString() === categoryId.toString() && config.entityName === entityName,
	);
};
