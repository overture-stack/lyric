import type { DataRecord } from '@overture-stack/lectern-client';
import type { SubmittedData } from '@overture-stack/lyric-data-model';

import type { BaseDependencies } from '../../config/config.js';
import submittedRepository from '../../repository/submittedRepository.js';
import type { SchemaChildNode } from '../../utils/dictionarySchemaRelations.js';
import { mergeSubmittedDataAndDeduplicateById } from '../../utils/submittedDataUtils.js';

const searchDataRelations = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SEARCH_DATA_RELATIONS_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const { logger } = dependencies;
	/**
	 * This function uses a dictionary children relations to query recursivaly
	 * to return all SubmittedData that relates
	 * @param input
	 * @param {DataRecord} input.data
	 * @param {Record<string, SchemaChildNode[]>} input.dictionaryRelations
	 * @param {string} input.entityName
	 * @param {string} input.organization
	 * @param {string} input.systemId
	 * @returns {Promise<SubmittedData[]>}
	 */
	const searchDirectDependents = async ({
		data,
		dictionaryRelations,
		entityName,
		organization,
		systemId,
	}: {
		data: DataRecord;
		dictionaryRelations: Record<string, SchemaChildNode[]>;
		entityName: string;
		organization: string;
		systemId: string;
	}): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		// Check if entity has children relationships
		if (Object.prototype.hasOwnProperty.call(dictionaryRelations, entityName)) {
			// Array that represents the children fields to filter

			const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = Object.values(
				dictionaryRelations[entityName],
			)
				.filter((childNode) => childNode.parent?.fieldName)
				.map((childNode) => ({
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: data[childNode.parent!.fieldName]?.toString(),
				}));

			logger.debug(
				LOG_MODULE,
				`Entity '${entityName}' has following dependencies filter'${JSON.stringify(filterData)}'`,
			);

			const directDependents = await getSubmittedDataFiltered(organization, filterData);

			const additionalDepend = (
				await Promise.all(
					directDependents.map((record) =>
						searchDirectDependents({
							data: record.data,
							dictionaryRelations,
							entityName: record.entityName,
							organization: record.organization,
							systemId: record.systemId,
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
