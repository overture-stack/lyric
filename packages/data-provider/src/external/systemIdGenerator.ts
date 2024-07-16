import { customAlphabet } from 'nanoid';

import { DataRecord } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import { NotImplemented } from '../utils/errors.js';
import { uniqueCharacters } from '../utils/formatUtils.js';

const systemIdGenerator = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ID_GENERATOR';
	const { idService, logger } = dependencies;

	// custom alphabet
	const alphabet = uniqueCharacters(idService.customAlphabet) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

	// custom size
	const size = idService.customSize || 21;

	const nanoid = customAlphabet(alphabet, size);

	return {
		/**
		 * Generate unique ID on system database
		 * @returns {string} generated ID
		 */

		generateIdentifier: (entityName: string, _dataRecord: DataRecord): string => {
			if (idService.useLocal) {
				const id = nanoid();
				logger.debug(LOG_MODULE, `System ID '${id}' generated for entity '${entityName}'`);
				return id;
			}
			throw new NotImplemented('ID Service not configured');
		},
	};
};

export default systemIdGenerator;
