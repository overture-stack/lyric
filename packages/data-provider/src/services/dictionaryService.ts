import { isEmpty } from 'lodash-es';
import { Dictionary as SchemasDictionary, Schema } from '@overture-stack/lectern-client';
import { Category, Dictionary, NewCategory, NewDictionary } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';

const dictionaryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'DICTIONARY_SERVICE';
	const { logger } = dependencies;

	/**
	 * Creates a new dictionary only if it doesn't exist or returns if it already exists
	 * @param dictionaryName The name of the dictionary to create
	 * @param version The version of the dictionary to create
	 * @param schemas The Schema of the dictionary
	 * @param defaultCentricEntity The Centric schema of the dictionary
	 * @returns The new dictionary created or the existing one
	 */
	const createDictionaryIfDoesNotExist = async (
		dictionaryName: string,
		version: string,
		schemas: Schema[],
	): Promise<Dictionary> => {
		const dictionaryRepo = dictionaryRepository(dependencies);
		try {
			const foundDictionary = await dictionaryRepo.getDictionary(dictionaryName, version);
			if (!isEmpty(foundDictionary)) {
				logger.info(LOG_MODULE, `Dictionary with name '${dictionaryName}' and version '${version}' already exists`);
				return foundDictionary;
			}

			const newDictionary: NewDictionary = {
				name: dictionaryName,
				version: version,
				dictionary: schemas,
			};
			const savedDictionary = await dictionaryRepo.save(newDictionary);
			return savedDictionary;
		} catch (error) {
			logger.error(LOG_MODULE, `Error saving dictionary`, error);
			throw error;
		}
	};

	/**
	 * Fetch the dictionary from Schema Service(Lectern)
	 * @param dictionaryName The dictionary name we want to fetch
	 * @param version The version of the dictionary we want to fetch
	 * @returns {SchemasDictionary} The found Dictionary
	 */
	const fetchDictionaryByVersion = async (dictionaryName: string, version: string): Promise<SchemasDictionary> => {
		try {
			if (!dependencies?.schemaService?.url) {
				throw new Error(`'schemaService' is not configured`);
			}

			const client = lecternClient(dependencies.schemaService.url, logger);
			const dictionaryResponse = await client.fetchDictionaryByVersion(dictionaryName, version);
			logger.debug(LOG_MODULE, `dictionary fetched from Lectern`, JSON.stringify(dictionaryResponse));
			return dictionaryResponse;
		} catch (error) {
			logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
			throw error;
		}
	};

	/**
	 * Try a fetch; if it fails and the version looks like a whole number (e.g., "1"),
	 * retry once with a ".0" suffix (e.g., "1.0"). Returns the dictionary and the
	 * version string that actually worked.
	 */
	const fetchWithVersionFallback = async (
		dictionaryName: string,
		version: string,
	): Promise<{ dict: SchemasDictionary; usedVersion: string }> => {
		try {
			const dict = await fetchDictionaryByVersion(dictionaryName, version);
			return { dict, usedVersion: version };
		} catch (firstErr) {
			const isWholeNumber = /^\d+$/.test(version);
			if (!isWholeNumber) {
				throw firstErr;
			}

			const alt = `${version}.0`;
			logger.warn(
				LOG_MODULE,
				`Fetch failed for '${dictionaryName}' with version '${version}'. Retrying with '${alt}'.`,
			);

			const dict = await fetchDictionaryByVersion(dictionaryName, alt);
			return { dict, usedVersion: alt };
		}
	};

	const getActiveDictionaryByCategory = async (categoryId: number): Promise<Dictionary | undefined> => {
		const categoryRepo = categoryRepository(dependencies);
		const dictionaryRepo = dictionaryRepository(dependencies);

		const category = await categoryRepo.getCategoryById(categoryId);

		if (!category) {
			logger.error(LOG_MODULE, `Category with id '${categoryId}' not found`);
			throw new Error(`Category with id '${categoryId}' not found`);
		}

		const dictionary = await dictionaryRepo.getDictionaryById(category.activeDictionaryId);

		if (!dictionary) {
			logger.error(LOG_MODULE, `Dictionary with id '${category.activeDictionaryId}' not found`);
			throw new Error(`Dictionary with id '${category.activeDictionaryId}' not found`);
		}

		return dictionary;
	};

	const register = async ({
		categoryName,
		dictionaryName,
		dictionaryVersion,
		defaultCentricEntity,
	}: {
		categoryName: string;
		dictionaryName: string;
		dictionaryVersion: string;
		defaultCentricEntity?: string;
	}): Promise<{ dictionary: Dictionary; category: Category }> => {
		logger.debug(
			LOG_MODULE,
			`Register new dictionary categoryName '${categoryName}' dictionaryName '${dictionaryName}' dictionaryVersion '${dictionaryVersion}'`,
		);

		const categoryRepo = categoryRepository(dependencies);

		const { dict: remoteDict, usedVersion } = await fetchWithVersionFallback(dictionaryName, dictionaryVersion);

		if (defaultCentricEntity && !remoteDict.schemas.some((schema) => schema.name === defaultCentricEntity)) {
			logger.error(LOG_MODULE, `Entity '${defaultCentricEntity}' does not exist in this dictionary`);
			throw new Error(`Entity '${defaultCentricEntity}' does not exist in this dictionary`);
		}

		const savedDictionary = await createDictionaryIfDoesNotExist(dictionaryName, usedVersion, remoteDict.schemas);

		// Check if Category exist
		const foundCategory = await categoryRepo.getCategoryByName(categoryName);

		if (foundCategory && foundCategory.activeDictionaryId === savedDictionary.id) {
			// Dictionary and Category already exists
			logger.info(LOG_MODULE, `Dictionary and Category already exists`);

			return { dictionary: savedDictionary, category: foundCategory };
		} else if (foundCategory && foundCategory.activeDictionaryId !== savedDictionary.id) {
			// Update the dictionary on existing Category
			const updatedCategory = await categoryRepo.update(foundCategory.id, {
				activeDictionaryId: savedDictionary.id,
				defaultCentricEntity,
			});

			logger.info(
				LOG_MODULE,
				`Category '${updatedCategory.name}' updated succesfully with Dictionary '${savedDictionary.name}' version '${savedDictionary.version}'`,
			);

			return { dictionary: savedDictionary, category: updatedCategory };
		} else {
			// Create a new Category
			const newCategory: NewCategory = {
				name: categoryName,
				activeDictionaryId: savedDictionary.id,
				defaultCentricEntity,
			};

			const savedCategory = await categoryRepo.save(newCategory);

			return { dictionary: savedDictionary, category: savedCategory };
		}
	};
	return {
		createDictionaryIfDoesNotExist,
		fetchDictionaryByVersion,
		getActiveDictionaryByCategory,
		register,
	};
};

export default dictionaryService;
