import type { DataRecord } from '@overture-stack/lectern-client';
import type { SubmittedData } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../../config/config.js';
import createSubmittedRepository from '../../repository/submittedRepository.js';
import type { RepositoryTransaction } from '../../repository/types.js';
import type { SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { mergeSubmittedDataAndDeduplicateById } from '../../utils/submittedDataUtils.js';

const searchDataRelations = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SEARCH_DATA_RELATIONS_SERVICE';
	const submittedDataRepository = createSubmittedRepository(dependencies);
	const { logger } = dependencies;
	/**
	 * Finds every SubmittedData record of `organization` that depends on the `entityName` record with `data`, following
	 * the children relations in `dictionaryRelations` recursively: the records whose foreign key references a field of
	 * `data`, then the records that depend on those, and so on.
	 *
	 * Returns each dependent once. Returns an empty array when the entity has no children relations or no record
	 * depends on it. `systemId` is only used for logging.
	 *
	 * @throws {ServiceUnavailable} When a query fails.
	 */
	const searchDirectDependents = async ({
		data,
		dictionaryRelations,
		entityName,
		organization,
		systemId,
		tx,
	}: {
		data: DataRecord;
		dictionaryRelations: Record<string, SchemaChildNode[]>;
		entityName: string;
		organization: string;
		systemId: string;
		tx?: RepositoryTransaction<SubmittedData>;
	}): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepository;

		// Check if entity has children relationships
		const entityRelations = dictionaryRelations[entityName];
		if (entityRelations) {
			// Array that represents the children fields to filter

			const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = Object.values(
				entityRelations,
			)
				.filter((childNode) => childNode.parent?.fieldName)
				.map((childNode) => ({
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: data[childNode.parent!.fieldName]?.toString(),
				}));

			if (filterData.length === 0) {
				return [];
			}

			logger.debug(
				LOG_MODULE,
				`Entity '${entityName}' has following dependencies filter'${JSON.stringify(filterData)}'`,
			);

			const directDependents = await getSubmittedDataFiltered(organization, filterData, tx);

			const additionalDepend = (
				await Promise.all(
					directDependents.map((record) =>
						searchDirectDependents({
							data: record.data,
							dictionaryRelations,
							entityName: record.entityName,
							organization: record.organization,
							systemId: record.systemId,
							tx,
						}),
					),
				)
			).flatMap((item) => item);

			const uniqueDependents = mergeSubmittedDataAndDeduplicateById(directDependents, additionalDepend);

			logger.info(LOG_MODULE, `Found '${uniqueDependents.length}' records depending on system ID '${systemId}'`);

			return uniqueDependents;
		}

		// return empty array when no dependents for this record
		return [];
	};

	return { searchDirectDependents };
};

export default searchDataRelations;
