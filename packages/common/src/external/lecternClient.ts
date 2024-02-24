import { entities as dictionaryEntities, restClient as dictionaryRestClient } from '@overturebio-stack/lectern-client';

export class LecternClient {
	constructor(private schemaServiceUrl: string) {}
	async fetchDictionaryByVersion(name: string, version: string): Promise<dictionaryEntities.SchemasDictionary> {
		try {
			const newSchema = await dictionaryRestClient.fetchSchema(this.schemaServiceUrl, name, version);
			return newSchema;
		} catch (error) {
			throw new Error(`Failed to fetch schema: ${error}`);
		}
	}
}
