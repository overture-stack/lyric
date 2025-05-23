import { Dictionary as SchemasDictionary, rest as dictionaryRestClient } from '@overture-stack/lectern-client';

import { Logger } from '../config/logger.js';
import { BadRequest, ServiceUnavailable } from '../utils/errors.js';

const client = (schemaServiceUrl: string, logger: Logger) => {
	const LOG_MODULE = 'LECTERN_CLIENT';
	return {
		/**
		 * Fetch a Dictionary using Schema Service(Lectern)
		 * @param name Dictionary Name
		 * @param version Dictionary version
		 * @returns A Dictionary found
		 */
		async fetchDictionaryByVersion(name: string, version: string): Promise<SchemasDictionary> {
			try {
				const dictionaryFetchResult = await dictionaryRestClient.getDictionary(schemaServiceUrl, { name, version });
				if (dictionaryFetchResult.success) {
					return dictionaryFetchResult.data;
				} else {
					logger.error(`Failed to fetch dictionary from schema service.`, dictionaryFetchResult.message);
					throw new BadRequest(`Schema with name '${name}' and version '${version}' not found`);
				}
			} catch (error) {
				logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default client;
