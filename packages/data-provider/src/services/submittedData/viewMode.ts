import type { Schema } from '@overture-stack/lectern-client';

import type { BaseDependencies } from '../../config/config.js';
import submittedRepository from '../../repository/submittedRepository.js';
import { generateHierarchy, type TreeNode } from '../../utils/dictionarySchemaRelations.js';
import { InternalServerError } from '../../utils/errors.js';
import { pluralizeSchemaName } from '../../utils/submissionUtils.js';
import { groupByEntityName } from '../../utils/submittedDataUtils.js';
import { type DataRecordNested, ORDER_TYPE, type SubmittedDataResponse } from '../../utils/types.js';

const viewMode = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'VIEW_MODE_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const recordHierarchy = dependencies.features?.recordHierarchy;
	const { logger } = dependencies;

	const convertRecordsToCompoundDocuments = async ({
		dictionary,
		records,
		defaultCentricEntity,
	}: {
		dictionary: Schema[];
		records: SubmittedDataResponse[];
		defaultCentricEntity?: string;
	}) => {
		// get dictionary hierarchy structure
		const hierarchyStructureDesc = generateHierarchy(dictionary, ORDER_TYPE.Values.desc);
		const hierarchyStructureAsc = generateHierarchy(dictionary, ORDER_TYPE.Values.asc);

		return await Promise.all(
			records.map(async (record) => {
				try {
					const childNodes = await traverseChildNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: defaultCentricEntity || record.entityName,
						treeNode: hierarchyStructureDesc,
					});

					const parentNodes = await traverseParentNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: defaultCentricEntity || record.entityName,
						treeNode: hierarchyStructureAsc,
					});

					record.data = { ...record.data, ...childNodes, ...parentNodes };
				} catch (error) {
					logger.error(`Error converting record ${record.systemId} into compound document`, error);
					throw new InternalServerError(`An error occurred while converting records into compound view`);
				}
				return record;
			}),
		);
	};

	/**
	 * Recursively traverses parent nodes of a schema tree and queries for related SubmittedData.
	 *
	 * This function takes in the current data record, entity name, organization, schema-centric information,
	 * and tree node structure, then filters and queries dependent records recursively, constructing a nested
	 * structure of related data.
	 *
	 * @param data - The current data record to traverse.
	 * @param entityName - The name of the entity (schema) associated with the current data.
	 * @param organization - The organization to which the data belongs.
	 * @param schemaCentric - The schema-centric identifier for filtering parent nodes.
	 * @param treeNode - The hierarchical structure representing schema relationships.
	 *
	 * @returns A promise that resolves to a nested `DataRecordNested` object, containing the traversed and filtered dependent data.
	 *          If no parent nodes or dependencies exist, it returns an empty object.
	 *
	 */
	const traverseParentNodes = async ({
		data,
		entityName,
		organization,
		schemaCentric,
		treeNode,
	}: {
		data: DataRecordNested;
		entityName: string;
		organization: string;
		schemaCentric: string;
		treeNode: TreeNode[];
	}): Promise<DataRecordNested> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		const parentNode = treeNode.find((node) => node.schemaName === schemaCentric)?.parent;

		if (!parentNode || !parentNode.parentFieldName || !parentNode.schemaName) {
			// return empty array when no dependents for this record
			return {};
		}

		const filterData: { entityName: string; dataField: string; dataValue: string | undefined } = {
			entityName: parentNode.schemaName,
			dataField: parentNode.fieldName || '',
			dataValue: data[parentNode.parentFieldName!]?.toString() || '',
		};

		logger.debug(
			LOG_MODULE,
			`Entity '${entityName}' has following dependencies filter '${JSON.stringify(filterData)}'`,
		);

		const directDependants = await getSubmittedDataFiltered(organization, [filterData]);

		const groupedDependants = groupByEntityName(directDependants);

		const result: DataRecordNested = {};
		for (const [entityName, records] of Object.entries(groupedDependants)) {
			const additionalRecordsForEntity = await Promise.all(
				records.map(async (record) => {
					const additional = await traverseParentNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: record.entityName,
						treeNode,
					});
					return { ...record.data, ...additional };
				}),
			);

			// Getting the first record as record can have only 1 parent
			result[entityName] = additionalRecordsForEntity[0];
		}

		return result;
	};

	/**
	 * Recursively traverses child nodes of a schema tree and queries for related SubmittedData.
	 *
	 * This function takes in the current data record, entity name, organization, schema-centric information,
	 * and tree node structure, then filters and queries dependent records recursively, constructing a nested
	 * structure of related data.
	 *
	 * @param data - The current data record to traverse.
	 * @param entityName - The name of the entity (schema) associated with the current data.
	 * @param organization - The organization to which the data belongs.
	 * @param schemaCentric - The schema-centric identifier for filtering child nodes.
	 * @param treeNode - The hierarchical structure representing schema relationships.
	 *
	 * @returns A promise that resolves to a nested `DataRecordNested` object, containing the traversed and filtered dependent data.
	 *          If no child nodes or dependencies exist, it returns an empty object.
	 *
	 */
	const traverseChildNodes = async ({
		data,
		entityName,
		organization,
		schemaCentric,
		treeNode,
	}: {
		data: DataRecordNested;
		entityName: string;
		organization: string;
		schemaCentric: string;
		treeNode: TreeNode[];
	}): Promise<DataRecordNested> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		const childNode = treeNode
			.find((node) => node.schemaName === schemaCentric)
			?.children?.filter((childNode) => childNode.parentFieldName && childNode.schemaName);

		if (!childNode || childNode.length === 0) {
			// return empty array when no dependents for this record
			return {};
		}

		const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = childNode.map(
			(childNode) => ({
				entityName: childNode.schemaName,
				dataField: childNode.fieldName || '',
				dataValue: data[childNode.parentFieldName!]?.toString() || '',
			}),
		);

		logger.debug(
			LOG_MODULE,
			`Entity '${entityName}' has following dependencies filter '${JSON.stringify(filterData)}'`,
		);

		const directDependants = await getSubmittedDataFiltered(organization, filterData);

		const groupedDependants = groupByEntityName(directDependants);

		const result: DataRecordNested = {};
		for (const [entityName, records] of Object.entries(groupedDependants)) {
			// if enabled ensures that schema names are consistently pluralized
			const dependantKeyName = recordHierarchy?.pluralizeSchemasName ? pluralizeSchemaName(entityName) : entityName;

			const additionalRecordsForEntity = await Promise.all(
				records.map(async (record) => {
					const additional = await traverseChildNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: record.entityName,
						treeNode,
					});
					return { ...record.data, ...additional };
				}),
			);

			result[dependantKeyName] = additionalRecordsForEntity;
		}

		return result;
	};

	return {
		convertRecordsToCompoundDocuments,
	};
};

export default viewMode;
