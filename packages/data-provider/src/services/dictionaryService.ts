import { isEmpty } from 'lodash-es';

import { Dictionary as SchemasDictionary, Schema } from '@overture-stack/lectern-client';
import { Category, Dictionary, NewCategory, NewDictionary } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import { BadRequest, StatusConflict } from '../utils/errors.js';
import migrationService from './migrationService.js';

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
		username?: string,
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
				createdBy: username,
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
	 * @returns {SchemaDictionary} The found Dictionary
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
		alias,
		categoryName,
		defaultCentricEntity,
		dictionaryName,
		dictionaryVersion,
		forceRegistration = false,
		username,
	}: {
		alias?: string;
		categoryName: string;
		defaultCentricEntity?: string;
		dictionaryName: string;
		dictionaryVersion: string;
		forceRegistration?: boolean;
		username?: string;
	}): Promise<{ category: Category; dictionary: Dictionary; migrationId?: number }> => {
		logger.debug(
			LOG_MODULE,
			`Register new dictionary categoryName '${categoryName}' dictionaryName '${dictionaryName}' dictionaryVersion '${dictionaryVersion}'`,
		);

		const categoryRepo = categoryRepository(dependencies);
		const { initiateMigration, getMigrationsByCategoryId } = migrationService(dependencies);

		const dictionary = await fetchDictionaryByVersion(dictionaryName, dictionaryVersion);

		if (defaultCentricEntity && !dictionary.schemas.some((schema) => schema.name === defaultCentricEntity)) {
			logger.error(LOG_MODULE, `Entity '${defaultCentricEntity}' does not exist in this dictionary`);
			throw new BadRequest(`Entity '${defaultCentricEntity}' does not exist in this dictionary`);
		}

		const savedDictionary = await createDictionaryIfDoesNotExist(
			dictionaryName,
			dictionaryVersion,
			dictionary.schemas,
			username,
		);

		// Check if Category exist
		const foundCategory = await categoryRepo.getCategoryByName(categoryName);

		if (foundCategory && alias) {
			// Alias assignment is creation-time only; reassigning an existing category's alias
			// is a separate, later feature.
			throw new BadRequest(
				`Category '${categoryName}' already exists; alias can only be set when creating a new category`,
			);
		}

		const initiateMigrationOrThrow = async ({
			categoryId,
			fromDictionaryId,
			toDictionaryId,
		}: {
			categoryId: number;
			fromDictionaryId: number;
			toDictionaryId: number;
		}): Promise<number> => {
			const resultMigration = await initiateMigration({
				categoryId,
				fromDictionaryId,
				toDictionaryId,
				userName: username || '',
			});

			if (!resultMigration.success) {
				const errorMessage = `Failed to initiate migration for category '${categoryName}' with error: ${resultMigration.data}`;
				logger.error(LOG_MODULE, errorMessage);
				throw new Error(errorMessage);
			}

			return resultMigration.data;
		};

		if (foundCategory && foundCategory.activeDictionaryId === savedDictionary.id) {
			// Dictionary and Category already exists
			logger.info(LOG_MODULE, `Dictionary and Category already exists`);

			// check last migration of this category to find if it failed, if it failed and forceRegistration is true,
			// we will re-initiate the migration with the new dictionary
			const activeMigration = await getMigrationsByCategoryId(foundCategory.id, { pageSize: 1, page: 1 });

			if (
				forceRegistration &&
				activeMigration.result.length === 1 &&
				activeMigration.result.at(0)?.status === 'FAILED'
			) {
				logger.info(
					LOG_MODULE,
					`Force flag is true, initiating migration for Category '${foundCategory.name}' 
					with Dictionary '${savedDictionary.name}' version '${savedDictionary.version}'`,
				);

				const migrationId = await initiateMigrationOrThrow({
					categoryId: foundCategory.id,
					fromDictionaryId: foundCategory.activeDictionaryId,
					toDictionaryId: savedDictionary.id,
				});

				return { dictionary: savedDictionary, category: foundCategory, migrationId };
			}

			throw new StatusConflict(
				`Category '${categoryName}' with Dictionary '${savedDictionary.name}' version '${savedDictionary.version}' already exists`,
			);
		} else if (foundCategory && foundCategory.activeDictionaryId !== savedDictionary.id) {
			// Update the dictionary on existing Category
			const updatedCategory = await categoryRepo.update(foundCategory.id, {
				activeDictionaryId: savedDictionary.id,
				defaultCentricEntity,
				updatedBy: username,
			});

			const migrationId = await initiateMigrationOrThrow({
				categoryId: updatedCategory.id,
				fromDictionaryId: foundCategory.activeDictionaryId,
				toDictionaryId: savedDictionary.id,
			});

			logger.info(
				LOG_MODULE,
				`Category '${updatedCategory.name}' updated successfully with Dictionary '${savedDictionary.name}' version '${savedDictionary.version}'`,
			);

			return { dictionary: savedDictionary, category: updatedCategory, migrationId };
		} else {
			// Create a new Category
			if (alias) {
				const existingAliasOwner = await categoryRepo.getCategoryByAlias(alias);
				if (existingAliasOwner) {
					throw new StatusConflict(`Category alias '${alias}' is already in use`);
				}
			}

			const newCategory: NewCategory = {
				activeDictionaryId: savedDictionary.id,
				alias: alias || undefined,
				createdBy: username,
				defaultCentricEntity,
				name: categoryName,
			};

			const savedCategory = await categoryRepo.save(newCategory);

			return { category: savedCategory, dictionary: savedDictionary };
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
