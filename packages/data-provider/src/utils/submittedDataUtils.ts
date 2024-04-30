import { functions } from '@overturebio-stack/lectern-client';
import {
	SchemaData,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { NewSubmittedData } from 'data-model';
import { groupBy, has } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import { SubmittedDataRepository, SubmittedDataResponse } from './types.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_UTILS';
	const { logger } = dependencies;
	return {
		/**
		 * Creates a list of SubmittedData grouped by entities and a matching list with only schema data
		 * @param {Array<NewSubmittedData>} data
		 * @returns
		 */
		groupSchemaDataByEntityName: (
			data: Array<NewSubmittedData>,
		): {
			submittedDataByEntityName: Record<string, NewSubmittedData[]>;
			schemaDataByEntityName: Record<string, SchemaData>;
		} => {
			return data.reduce(
				(
					result: {
						submittedDataByEntityName: Record<string, NewSubmittedData[]>;
						schemaDataByEntityName: Record<string, SchemaData>;
					},
					submittedDataObject,
				) => {
					result.schemaDataByEntityName[submittedDataObject.entityName] = [
						...(result.schemaDataByEntityName[submittedDataObject.entityName] || []),
						{ ...submittedDataObject.data },
					];
					result.submittedDataByEntityName[submittedDataObject.entityName] = [
						...(result.submittedDataByEntityName[submittedDataObject.entityName] || []),
						{ ...submittedDataObject },
					];
					return result;
				},
				{ submittedDataByEntityName: {}, schemaDataByEntityName: {} },
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

		parseSubmittedData: (recordsArray: SubmittedDataRepository[]): SubmittedDataResponse[] => {
			return recordsArray.map((record) => {
				return {
					entityName: record.entityName,
					data: record.data,
					isValid: record.isValid || false,
					organization: record.organization,
				};
			});
		},
	};
};

export default utils;
