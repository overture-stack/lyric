import { entities as dictionaryEntities, restClient as dictionaryRestClient } from '@overturebio-stack/lectern-client';
import { Logger } from '../config/logger.js';

import { BadRequest, ServiceUnavailable } from '../utils/errors.js';

const client = (schemaServiceUrl: string, logger: Logger) => {
	const LOG_MODULE = 'LECTERN_CLIENT';
	return {
		async fetchDictionaryByVersion(name: string, version: string): Promise<dictionaryEntities.SchemasDictionary> {
			try {
				const newSchema = await dictionaryRestClient.fetchSchema(schemaServiceUrl, name, version);
				if (!newSchema) throw new BadRequest(`Schema with name '${name}' and version '${version}' not found`);
				return newSchema;
			} catch (error) {
				logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default client;
