import { BaseDependencies } from '../config/config.js';
import submittedRepository from '../repository/submittedRepository.js';
import { convertSqonToQuery, parseSQON } from '../utils/convertSqonToQuery.js';

const validationService = (dependencies: BaseDependencies) => {
	const { logger } = dependencies;
	const submittedDataRepo = submittedRepository(dependencies);
	const LOG_MODULE = 'VALIDATION_SERVICE';

	return {
		/**
		 * Checks whether a specific record exists in the database based on the given criteria.
		 * @param param0
		 * @returns A promise that resolves to `true` if the record exists, or `false` if not.
		 */
		existsRecord: async ({
			categoryId,
			entityName,
			field,
			organization,
			value,
		}: {
			categoryId: number;
			entityName: string;
			field: string;
			organization: string;
			value: string;
		}): Promise<boolean> => {
			const { getTotalRecordsByCategoryIdAndOrganization } = submittedDataRepo;

			try {
				const filterSqon = convertSqonToQuery(
					parseSQON({
						op: 'in',
						content: { fieldName: field, value: [value] },
					}),
				);

				const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, {
					sql: filterSqon,
					entityNames: [entityName],
				});

				return totalRecords > 0;
			} catch (error) {
				logger.error(LOG_MODULE, 'Error validating record', { error });
				throw new Error('Error validating the record.');
			}
		},
	};
};

export default validationService;
