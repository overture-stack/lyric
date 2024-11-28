import { BaseDependencies } from '../config/config.js';
import { NotFound } from '../utils/errors.js';
import { and, count, eq } from 'drizzle-orm/sql';
import { submittedData} from '@overture-stack/lyric-data-model';
const validationService = (dependencies: BaseDependencies) => {
    const { db, logger } = dependencies; 
    const LOG_MODULE = 'VALIDATION_SERVICE';

    return {
        validateRecord: async ({
            categoryId,
            entityName,
            studyId,
            value,
        }: {
            categoryId: number;
            entityName: string;
            studyId: string;
            value: string;
        }): Promise<boolean> => {
            logger.debug(LOG_MODULE, 'Validating record', { categoryId, entityName, studyId, value });

            try {
                
                const filterEntityNameSql = eq(submittedData.entityName, entityName);
                const filter = eq(submittedData.systemId, studyId); //todo need to change

                const resultCount = await db
                    .select({ total: count() })
                    .from(submittedData) //todo need to change
                    .where(
                        and(
                            eq(submittedData.dictionaryCategoryId, categoryId),
                            eq(submittedData, value),
                            filter, 
                            filterEntityNameSql 
                    ));

                // Return the total count
                return resultCount[0]?.total > 0;
            } catch (error) {
                logger.error(LOG_MODULE, 'Error validating record', { error });
                throw new NotFound('Error validating the record.');
            }
        },
    };
};

export default validationService;
