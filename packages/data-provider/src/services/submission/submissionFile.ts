import { type Schema } from '@overture-stack/lectern-client';

import { SUPPORTED_FILE_EXTENSIONS, type SupportedFileExtension } from '../../utils/fileUtils.js';
import { failure, type Result, success } from '../../utils/result.js';
import type { FilenameEntityPair } from '../../utils/schemas.js';
import type { ObjectValues } from '../../utils/types.js';

export const SUBMITTED_FILE_ERROR_CODES = {
	FILE_READ_FAILURE: 'FILE_READ_ERROR',
	UNSUPPORTED_FILETYPE: 'UNSUPPORTED_FILETYPE',
	PARSING_FAILURE: 'PARSING_ERROR',
	UNKNOWN_ENTITY: 'UNKNOWN_ENTITY',
	INVALID_FILE_NAME: 'INVALID_FILE_NAME',
	UNRECOGNIZED_HEADER: 'UNRECOGNIZED_HEADER',
	MISSING_REQUIRED_HEADER: 'MISSING_REQUIRED_HEADER',
	INCORRECT_SECTION: 'INCORRECT_SECTION',
} as const;

export type SubmittedFileErrorCode = ObjectValues<typeof SUBMITTED_FILE_ERROR_CODES>;

export type SubmittedFileError = {
	code: SubmittedFileErrorCode;
	message: string;
};

/**
 * Attempt to identify the file type from a submitted file. If the filetype is unsupported then this will return
 * a failure with the corresponding SubmittedFileError.
 *
 * Note: This function uses the file extension extracted from the filename to identify the file type.
 */
export function getSubmittedFileType(file: Express.Multer.File): Result<SupportedFileExtension, SubmittedFileError> {
	const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

	const validationResult = SUPPORTED_FILE_EXTENSIONS.safeParse(fileExtension);

	if (!validationResult.success) {
		return failure({
			code: SUBMITTED_FILE_ERROR_CODES.UNSUPPORTED_FILETYPE,
			message: `File extension ${fileExtension} does not match any of the supported filetypes "${Object.values(SUPPORTED_FILE_EXTENSIONS.Values).join(',')}"`,
		});
	}

	return success(validationResult.data);
}

/**
 * This function will look at the file's filename and find a matching entry in the entity-file map, returning the
 *   corresponding entity's schema when found.
 *
 * There are several failure cases when looking for a file in the entity-file map:
 * 1. no matches to the file name -> returns failure with `FILENAME_NOT_FOUND`
 * 2. multiple matches to the file name -> if all entries map to the same entity, this is treated the same as a single
 *    match, but if they map to different entities then we return failure with `MULTIPLE_MATCHES`
 * 3. a single match is found, but there is no schema with a matching entity name -> retunrs failure with `UNKNOWN_ENTITY`
 * @param params
 * @returns
 */
function findEntityByFileEntityMap(params: {
	file: Express.Multer.File;
	schemas: Schema[];
	fileEntityMap: FilenameEntityPair[];
}): Result<
	Schema,
	| { case: 'FILENAME_NOT_FOUND' }
	| { case: 'UNKNOWN_ENTITY'; entityName: string }
	| { case: 'MULTIPLE_MATCHES'; entityNames: string[] }
> {
	const { file, schemas, fileEntityMap } = params;
	const mapMatches = fileEntityMap.filter((map) => map.filename === file.originalname);

	// Multiple entries in the map match this filename
	if (mapMatches.length > 1) {
		const entities = new Set(mapMatches.map((entry) => entry.entity));
		if (entities.size > 1) {
			// There are different entities listed in the map objects, so we cannot identify which entity to use
			return failure({ case: 'MULTIPLE_MATCHES' as const, entityNames: Array.from(entities) });
		}
	}

	// after the multiple entries check, we know that all matches have the same entity name (or there are no matches)
	const candidateEntity = mapMatches[0]?.entity.toLowerCase();
	if (candidateEntity === undefined) {
		// No Matching Entries
		return failure({ case: 'FILENAME_NOT_FOUND' as const });
	}

	// Single matching entry, or multiple matching entries but all entries have the same entity name
	const matchingSchema = schemas.find((schema) => schema.name.toLowerCase() === candidateEntity);
	if (!matchingSchema) {
		return failure({ case: 'UNKNOWN_ENTITY' as const, entityName: candidateEntity });
	}
	return success(matchingSchema);
}

function findEntityByFilename(params: { file: Express.Multer.File; schemas: Schema[] }): Schema | undefined {
	const { file, schemas } = params;
	const filenameWithoutExtension = file.originalname.split('.')[0]?.toLowerCase();
	return schemas.find((schema) => schema.name.toLowerCase() === filenameWithoutExtension);
}

/**
 * Attempt to match a file with the schema entity that it has data for.
 *
 * This function will first check if a mapping was provided to match each filename to an entity.
 * If no match is found in the fileEntityMap, then the filename will be check for a match with a schema name (case insensitive).
 * If no match is found, then a Failure result will return with the `UNKNOWN_ENTITY` error code.
 */
export function getSubmittedFileEntity(params: {
	file: Express.Multer.File;
	schemas: Schema[];
	fileEntityMap?: FilenameEntityPair[];
}): Result<Schema, SubmittedFileError> {
	const { file, schemas, fileEntityMap } = params;

	if (fileEntityMap) {
		const mapResult = findEntityByFileEntityMap({ file, schemas, fileEntityMap });
		if (mapResult.success) {
			return success(mapResult.data);
		}
		switch (mapResult.data.case) {
			case 'FILENAME_NOT_FOUND': {
				// no match found, attempt to use filename instead.
				break;
			}
			case 'UNKNOWN_ENTITY': {
				// Mapped to an unknown entity, return failure
				return failure({
					code: SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY,
					message: `Provided File-Entity map indicated the file "${file.originalname}" maps to an entity named "${mapResult.data.entityName}", which does not match any of the available Schema names.`,
				});
			}
			case 'MULTIPLE_MATCHES': {
				// Multiple mappings found, cannot map file to an entity, return failure
				return failure({
					code: SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY,
					message: `Provided File-Entity map has multiple matches for the file ${file.originalname}: ${mapResult.data.entityNames.join(', ')}`,
				});
			}
		}
	}

	const filenameEntity = findEntityByFilename({ file, schemas });
	if (filenameEntity) {
		return success(filenameEntity);
	}

	return failure({
		code: SUBMITTED_FILE_ERROR_CODES.UNKNOWN_ENTITY,
		message: `The file named "${file.originalname}" cannot be mapped to an entity.`,
	});
}
