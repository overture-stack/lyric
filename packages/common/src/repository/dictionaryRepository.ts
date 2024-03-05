import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';

const repository = (dependencies: Dependencies) => {
	const LOG_MODULE = 'DICTIONARY_REPOSITORY';
	const { db, logger } = dependencies;
	return {
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
