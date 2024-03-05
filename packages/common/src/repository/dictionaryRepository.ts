import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';

const repository = (dependencies: Dependencies) => {
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
		 * Find a Dictionary in Database
		 * @param selectionFields Specific fields we want to get. Use '{}' (empty Object) to get all the fields from a Dictionary
		 * @param conditions SQL where clause
		 * @returns The Dictionary found
		 */
		select: async <P extends Partial<(typeof dictionaries)['_']['columns']>>(
			selectionFields: P,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<Dictionary[]> => {
			logger.debug(LOG_MODULE, `Querying Dictionary`);
			try {
				if (isEmpty(selectionFields)) return await db.select().from(dictionaries).where(conditions);
				return await db.select(selectionFields).from(dictionaries).where(conditions);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Dictionary`, error);
				throw error;
			}
		},
	};
};

export default repository;
