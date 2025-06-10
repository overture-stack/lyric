import { type DataRecord, parse, type Schema } from '@overture-stack/lectern-client';
import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

import { getSchemaByName } from './dictionaryUtils.js';
import { convertRecordToString, isNotNull, notEmpty } from './formatUtils.js';
import { createBatchResponse } from './submissionResponseParser.js';
import type { EntityData, SchemasDictionary } from './types.js';

/**
 * Creates a parser function that converts raw string-based records into typed values using the given schema.
 * Uses Lectern client parsing function
 * @param schema  The schema definition used to interpret and convert field values.
 * @returns A function that takes a record with string values and returns a typed data record based on the schema.
 */
export const getSchemaParser = (schema: Schema) => (record: Record<string, string>) => {
	const parsedRecord = parse.parseRecordValues(record, schema);
	return parsedRecord.data.record;
};

/**
 * Parses raw records into typed data records based on the provided schema.
 * @param dataRecords An array of unprocessed records with unknown value types.
 * @param schema The schema definition used to convert and validate each record's fields.
 * @returns An array of valid typed data records.
 */
export const convertToTypedRecords = (dataRecords: Record<string, unknown>[], schema: Schema): DataRecord[] => {
	return Object.values(dataRecords).map(convertRecordToString).map(getSchemaParser(schema)).filter(notEmpty);
};

/**
 * Converts a collection of raw entity records into typed records
 * using schema definitions to validate and transform the data.
 * @param records A map of entity names to arrays of raw records. Each record is untyped and unvalidated.
 * @param schemasDictionary A dictionary of schema definitions used to validate and convert each entity's records.
 * @returns A map of entity names to `DataRecord[]` containing typed records.
 */
export const parseRecordsToEdit = (
	records: EntityData,
	schemasDictionary: SchemasDictionary,
): Record<string, DataRecord[]> => {
	return Object.fromEntries(
		Object.entries(records)
			.map(([schemaName, dataRecords]) => {
				const entitySchema = getSchemaByName(schemaName, schemasDictionary);
				if (!entitySchema) {
					// Entity name not found
					return null;
				}

				const parsedRecords = convertToTypedRecords(dataRecords, entitySchema);
				if (parsedRecords.length === 0) {
					// No records for this entity
					return null;
				}

				return [schemaName, parsedRecords];
			})
			.filter(isNotNull),
	);
};

/**
 * Converts a collection of raw entity records into typed batches ready for insertion,
 * using schema definitions to validate and transform the data.
 * @param records A map of entity names to arrays of raw records. Each record is untyped and unvalidated.
 * @param schemasDictionary A dictionary of schema definitions used to validate and convert each entity's records.
 * @returns A map of entity names to `SubmissionInsertData` batches containing typed records.
 */
export const parseRecordsToInsert = (
	records: EntityData,
	schemasDictionary: SchemasDictionary,
): Record<string, SubmissionInsertData> => {
	return Object.fromEntries(
		Object.entries(records)
			.map(([schemaName, dataRecords]) => {
				const entitySchema = getSchemaByName(schemaName, schemasDictionary);
				if (!entitySchema) {
					// Entity name not found
					return null;
				}

				const parsedRecords = convertToTypedRecords(dataRecords, entitySchema);
				if (parsedRecords.length === 0) {
					// No records for this entity
					return null;
				}

				return [schemaName, createBatchResponse(schemaName, parsedRecords)];
			})
			.filter(isNotNull),
	);
};
