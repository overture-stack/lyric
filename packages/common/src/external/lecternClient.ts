import { entities as dictionaryEntities, restClient as dictionaryRestClient } from '@overturebio-stack/lectern-client';

const client = (schemaServiceUrl: string) => {
	return {
		async fetchDictionaryByVersion(name: string, version: string): Promise<dictionaryEntities.SchemasDictionary> {
			try {
				const newSchema = await dictionaryRestClient.fetchSchema(schemaServiceUrl, name, version);
				return newSchema;
			} catch (error) {
				throw new Error(`Failed to fetch schema: ${error}`);
			}
		},
	};
};

export default client;
