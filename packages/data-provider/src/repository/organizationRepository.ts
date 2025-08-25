import { eq } from 'drizzle-orm/sql';

import { organizations, Organization, NewOrganization } from '@overture-stack/lyric-data-model/models';
import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ORGANIZATION_REPOSITORY';
	const { db, logger } = dependencies;

	return {
		/**
		 * Save a new Organization in the database
		 * @param data A new organization object to be saved
		 * @returns The created Organization
		 */
		save: async (data: NewOrganization): Promise<Organization> => {
			try {
				const savedOrg = await db.insert(organizations).values(data).returning();
				logger.info(LOG_MODULE, `Organization '${data.name}' saved successfully`);
				return savedOrg[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed to save Organization '${data.name}'`, error);
				throw error;
			}
		},

		/**
		 * Finds an Organization by name
		 * @param {string} name Organization name
		 * @returns The Organization found or undefined
		 */
		getOrganizationByName: async (name: string): Promise<Organization | undefined> => {
			try {
				return await db.query.organizations.findFirst({
					where: eq(organizations.name, name),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Organization with name '${name}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds an Organization by ID
		 * @param {number} organizationId
		 * @returns {Promise<Organization | undefined>}
		 */
		getOrganizationById: async (organizationId: number): Promise<Organization | undefined> => {
			try {
				return await db.query.organizations.findFirst({
					where: eq(organizations.id, organizationId),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Organization with id '${organizationId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Delete an Organization by ID
		 * @param {number} organizationId
		 */
		delete: async (organizationId: number): Promise<void> => {
			try {
				await db.delete(organizations).where(eq(organizations.id, organizationId));
				logger.info(LOG_MODULE, `Organization with id '${organizationId}' deleted successfully`);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed deleting Organization with id '${organizationId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
