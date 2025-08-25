import { isEmpty } from 'lodash-es';
import { BaseDependencies } from '../config/config.js';

import organizationRepository from '../repository/organizationRepository.js';
import { Organization, NewOrganization } from '@overture-stack/lyric-data-model/models';

const organizationService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ORGANIZATION_SERVICE';
	const { logger } = dependencies;

	/**
	 * Registers a new Organization if it does not already exist
	 * @param name The organization name
	 * @returns {Organization} The saved or existing organization
	 */
	const registerOrganization = async (name: string): Promise<Organization> => {
		const orgRepo = organizationRepository(dependencies);

		try {
			const existingOrg = await orgRepo.getOrganizationByName(name);

			if (!isEmpty(existingOrg)) {
				logger.info(LOG_MODULE, `Organization '${name}' already exists`);
				return existingOrg;
			}

			const newOrg: NewOrganization = {
				name,
			};

			const savedOrg = await orgRepo.save(newOrg);

			logger.info(LOG_MODULE, `Organization '${name}' registered successfully`);
			return savedOrg;
		} catch (error) {
			logger.error(LOG_MODULE, `Error registering organization '${name}'`, error);
			throw error;
		}
	};

	/**
	 * Deletes an existing Organization by ID
	 * @param orgId The ID of the organization to delete
	 * @returns boolean - true if deleted, false if not found
	 */
	const deleteOrganization = async (orgId: number): Promise<boolean> => {
		const orgRepo = organizationRepository(dependencies);

		try {
			const existingOrg = await orgRepo.getOrganizationById(orgId);

			if (!existingOrg) {
				logger.warn(LOG_MODULE, `Organization with id '${orgId}' not found`);
				return false;
			}

			await orgRepo.delete(orgId);
			logger.info(LOG_MODULE, `Organization with id '${orgId}' deleted successfully`);

			return true;
		} catch (error) {
			logger.error(LOG_MODULE, `Error deleting organization with id '${orgId}'`, error);
			throw error;
		}
	};

	/**
	 * Retrieves an Organization by name
	 * @param name The organization name
	 * @returns {Organization | undefined} The organization if found, else undefined
	 */
	const getOrganizationByName = async (name: string): Promise<Organization | undefined> => {
		const orgRepo = organizationRepository(dependencies);

		try {
			const organization = await orgRepo.getOrganizationByName(name);
			return organization;
		} catch (error) {
			logger.error(LOG_MODULE, `Error fetching organization by name '${name}'`, error);
			throw error;
		}
	};

	return {
		registerOrganization,
		deleteOrganization,
		getOrganizationByName,
	};
};

export default organizationService;
