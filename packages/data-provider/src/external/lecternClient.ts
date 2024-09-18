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
			let newSchema;
			try {
				newSchema = await dictionaryRestClient.fetchSchema(schemaServiceUrl, name, version);
			} catch (error) {
				logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
				throw new ServiceUnavailable();
			}

			if (!newSchema) throw new BadRequest(`Schema with name '${name}' and version '${version}' not found`);
			return newSchema;
		},
	};
};

export default client;
