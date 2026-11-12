import type { BaseDependencies, ValidatorConfig } from '../config/config.js';
import type { AuthConfig } from '../middleware/auth.js';
import auditRouter from './auditRouter.js';
import categoryRouter from './categoryRouter.js';
import dictionaryRouter from './dictionaryRouter.js';
import migrationRouter from './migrationRouter.js';
import submissionRouter from './submissionRouter.js';
import submittedDataRouter from './submittedDataRouter.js';
import validationRouter from './validationRouter.js';

/**
 * Creates all of Lyric's routers. Add a router here rather than in `provider`, so the router authentication test
 * checks it.
 */
export const createRouters = ({
	authConfig,
	baseDependencies,
	validatorConfig,
}: {
	authConfig: AuthConfig;
	baseDependencies: BaseDependencies;
	validatorConfig: ValidatorConfig;
}) => ({
	audit: auditRouter({ authConfig, baseDependencies }),
	category: categoryRouter({ authConfig, baseDependencies }),
	dictionary: dictionaryRouter({ authConfig, baseDependencies }),
	migration: migrationRouter({ authConfig, baseDependencies }),
	submission: submissionRouter({ authConfig, baseDependencies }),
	submittedData: submittedDataRouter({ authConfig, baseDependencies }),
	validator: validationRouter({ authConfig, baseDependencies, validatorConfig }),
});
