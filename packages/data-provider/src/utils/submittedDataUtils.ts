import { groupBy, has } from 'lodash-es';

import {
	NewSubmittedData,
	type SubmissionDeleteData,
	submittedData,
	SubmittedData,
} from '@overture-stack/lyric-data-model';
import { functions } from '@overturebio-stack/lectern-client';
import {
	SchemaData,
	SchemasDictionary,
	SchemaValidationError,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import {
	DataRecordReference,
	MERGE_REFERENCE_TYPE,
	type GroupedDataSubmission,
	type SubmittedDataResponse,
} from './types.js';

const utils = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_UTILS';
	const { logger } = dependencies;
	return {
		/**
		 * Abstract Error response
		 * @param error
		 * @returns
		 */
		fetchDataErrorResponse: (
			error: string,
		): {
			data: [];
			metadata: { totalRecords: number; errorMessage?: string };
		} => {
			return {
				data: [],
				metadata: {
					totalRecords: 0,
					errorMessage: error,
				},
			};
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
		 * Groups `NewSubmittedData` and `SubmittedData` objects by their `entityName` field.
		 * @param data An object containing arrays of `NewSubmittedData` and `SubmittedData` objects.
		 * @returns An object containing two properties:
		 * - `submittedDataByEntityName`: A record where each key is an `entityName` and the value is an array of
		 *   `NewSubmittedData` or `SubmittedData` objects associated with that entity.
		 * - `schemaDataByEntityName`: A record where each key is an `entityName` and the value is an array of
		 *   `SchemaData` objects primarily intended for schema validation.
		 *
		 */
		groupSchemaDataByEntityName: (data: { inserts?: NewSubmittedData[]; submittedData?: SubmittedData[] }) => {
			const combinedData = [...(data?.inserts || []), ...(data?.submittedData || [])];
			return combinedData.reduce<GroupedDataSubmission>(
				(result, submittedDataObject) => {
					const { entityName, data: recordData } = submittedDataObject;

					result.schemaDataByEntityName[entityName] = [
						...(result.schemaDataByEntityName[entityName] || []),
						{ ...recordData },
					];

					result.submittedDataByEntityName[entityName] = [
						...(result.submittedDataByEntityName[entityName] || []),
						{ ...submittedDataObject },
					];
					return result;
				},
				{ submittedDataByEntityName: {}, schemaDataByEntityName: {} },
			);
		},

		/**
		 * Receives any object and finds if it contains an specific key
		 * @param {object} hasErrorByIndex An object to evaluate
		 * @param {number} index An object key
		 * @returns
		 */
		hasErrorsByIndex: (hasErrorByIndex: object, index: number): boolean => {
			const hasErrors = has(hasErrorByIndex, index);
			if (hasErrors) {
				logger.info(LOG_MODULE, `Data in index '${index}' is not valid`);
			}
			return hasErrors;
		},

		/**
		 * Parses an array of SubmittedData objects into a more compact form used as a respone
		 * @param {SubmittedData[]} submittedData
		 * @returns {SubmittedDataResponse[]}
		 */
		mapRecordsSubmittedDataResponse: (submittedData: SubmittedData[]): SubmittedDataResponse[] => {
			return submittedData.map((data) => ({
				data: data.data,
				entityName: data.entityName,
				isValid: data.isValid,
				organization: data.organization,
				systemId: data.systemId,
			}));
		},

		/**
		 * Transforms an array of `SubmittedData` into a `Record<string, DataRecordReference[]>`,
		 * where each key is the `entityName` from the `SubmittedData`, and the value is an array of
		 * `DataRecordReference` objects associated with that `entityName`.
		 * @param {SubmittedData[] | undefined} submittedData An array of `SubmittedData` objects to be transformed.
		 * @returns {Record<string, DataRecordReference[]>}
		 */
		transformSubmittedDataSchemaByEntityName: (
			submittedData: SubmittedData[] | undefined,
		): Record<string, DataRecordReference[]> => {
			if (!submittedData) return {};

			return submittedData.reduce<Record<string, DataRecordReference[]>>((acc, entityData) => {
				const record = {
					dataRecord: entityData.data,
					reference: {
						submittedDataId: entityData.id,
						type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					},
				};

				acc[entityData.entityName] = [...(acc[entityData.entityName] || [])].concat(record);
				return acc;
			}, {});
		},

		/**
		 * Transforms an array of `SubmittedData` into a `Record<string, SubmissionDeleteData[]>`,
		 * where each key is the `entityName` from the `SubmittedData`, and the value is an array of
		 * `SubmissionDeleteData` objects associated with that `entityName`.
		 * @param submittedData An array of `SubmittedData` objects to be transformed.
		 * @returns
		 */
		transformmSubmittedDataToSubmissionDeleteData: (submittedData: SubmittedData[]) => {
			return submittedData.reduce<Record<string, SubmissionDeleteData[]>>((acc, entityData) => {
				const record = {
					data: entityData.data,
					entityName: entityData.entityName,
					isValid: entityData.isValid,
					organization: entityData.organization,
					systemId: entityData.systemId,
				};
				acc[entityData.entityName] = [...(acc[entityData.entityName] || [])].concat(record);
				return acc;
			}, {});
		},

		/**
		 * Validate a full set of Schema Data using a Dictionary
		 * @param {SchemasDictionary & {id: number }} dictionary
		 * @param {Record<string, SchemaData>} schemasData
		 * @returns an array of processedRecords and validationErrors for each Schema
		 */
		validateSchemas: (
			dictionary: SchemasDictionary & {
				id: number;
			},
			schemasData: Record<string, SchemaData>,
		) => {
			const schemasDictionary: SchemasDictionary = {
				name: dictionary.name,
				version: dictionary.version,
				schemas: dictionary.schemas,
			};

			return functions.processSchemas(schemasDictionary, schemasData);
		},
	};
};

export default utils;
