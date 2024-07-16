import { and, eq } from 'drizzle-orm/sql';

import { dictionaries, Dictionary, NewDictionary } from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'DICTIONARY_REPOSITORY';
	const { db, logger } = dependencies;
	return {
		/**
		 * Save a new Dictionary in Database
		 * @param data A dictionary object to be saved
		 * @returns The created dictionary
		 */
		save: async (data: NewDictionary): Promise<Dictionary> => {
			try {
				const savedDictionary = await db.insert(dictionaries).values(data).returning();
				logger.info(LOG_MODULE, `Dictionary with name '${data.name}' and version '${data.version}' saved successfully`);
				return savedDictionary[0];
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed saving Dictionary with name '${data.name}' and version '${data.version}'`,
					error,
				);
				throw error;
			}
		},

		/**
		 * Finds a Dictionary by name and version
		 * @param {string} dictionaryName Dictionary name
		 * @param {string} version Dictionary version
		 * @returns The Dictionary found
		 */
		getDictionary: async (dictionaryName: string, version: string): Promise<Dictionary | undefined> => {
			try {
				return await db.query.dictionaries.findFirst({
					where: and(eq(dictionaries.name, dictionaryName), eq(dictionaries.version, version)),
				});
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed querying Dictionary with name '${dictionaryName}' and version '${version}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds a Dictionary by internal ID
		 * @param {number} dictionaryId
		 * @returns {Promise<Dictionary | undefined>}
		 */
		getDictionaryById: async (dictionaryId: number): Promise<Dictionary | undefined> => {
			try {
				return await db.query.dictionaries.findFirst({
					where: eq(dictionaries.id, dictionaryId),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Dictionary with id '${dictionaryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
