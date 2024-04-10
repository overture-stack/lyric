import { functions } from '@overturebio-stack/lectern-client';
import {
	SchemaData,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { groupBy, has } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import { NewSubmittedData } from '../models/submitted_data.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_UTILS';
	const { logger } = dependencies;
	return {
		/**
		 * Creates a map of SubmittedData grouped by entities
		 * @param {Array<NewSubmittedData>} data
		 * @returns
		 */
		mapSchemaDataByEntity: (
			data: Array<NewSubmittedData>,
		): { original: Record<string, NewSubmittedData[]>; schemaData: Record<string, SchemaData> } => {
			return data.reduce(
				(acc: { original: Record<string, NewSubmittedData[]>; schemaData: Record<string, SchemaData> }, cur) => {
					acc.schemaData[cur.entityName] = [...(acc.schemaData[cur.entityName] || []), { ...cur.data }];
					acc.original[cur.entityName] = [...(acc.original[cur.entityName] || []), { ...cur }];
					return acc;
				},
				{ original: {}, schemaData: {} },
			);
		},

		/**
		 * Validate a full set of Schema Data using a Dictionary
		 * @param {SchemasDictionary & {id: number }} dictionary
		 * @param {Record<string, SchemaData>} schemaData
		 * @returns an array of processedRecords and validationErrors for each Schema
		 */
		validateSchemas: (
			dictionary: SchemasDictionary & {
				id: number;
			},
			schemaData: Record<string, SchemaData>,
		) => {
			const schemasDictionary: SchemasDictionary = {
				name: dictionary.name,
				version: dictionary.version,
				schemas: dictionary.schemas,
			};

			return functions.processSchemas(schemasDictionary, schemaData);
		},

		/**
		 * Get all the schema errors grouped by the index of the record
		 * @param {SchemaValidationError[]} schemaValidationErrors
		 * @param {string} entityName
		 * @returns
		 */
		groupErrorsByIndex: (schemaValidationErrors: readonly SchemaValidationError[], entityName: string) => {
			const groupedBy = groupBy(schemaValidationErrors, 'index');

			if (Object.keys(groupedBy).length > 0) {
				logger.info(LOG_MODULE, `Entity '${entityName}' has some errors`, JSON.stringify(groupedBy));
			}
			return groupedBy;
		},

		/**
		 * Received any object and finds if it contains an specific key
		 * @param {object} hasErrorByIndex An object to evaluate
		 * @param index An object key
		 * @returns
		 */
		hasErrorsByIndex: (hasErrorByIndex: object, index: number): boolean => {
			const hasErrors = has(hasErrorByIndex, index);
			if (hasErrors) {
				logger.info(LOG_MODULE, `Data in index '${index}' is not valid`);
			}
			return hasErrors;
		},
	};
};

export default utils;
