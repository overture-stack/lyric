// config
export { type AppConfig, type LoggerConfig, type ValidatorEntry } from './src/config/config.js';
export { connect } from './src/config/db.js';
export { getLogger, type Logger } from './src/config/logger.js';
export { type DbConfig, migrate } from '@overture-stack/lyric-data-model';

// core
export { default as provider } from './src/core/provider.js';

// external integrations
export { createKafkaPublisher, type KafkaProducer, type KafkaPublisherConfig } from './src/external/kafkaPublisher.js';
export { createPublishTracker } from './src/external/kafkaPublishTracker.js';

// middleware
export {
	type AuthConfig,
	type RequestWithUser,
	type UserSession,
	type UserSessionResult,
} from './src/middleware/auth.js';
export { errorHandler } from './src/middleware/errorHandler.js';

// routes
export { default as dictionaryRouters } from './src/routers/dictionaryRouter.js';
export { default as submissionRouter } from './src/routers/submissionRouter.js';
export { default as submittedDataRouter } from './src/routers/submittedDataRouter.js';

// utils
export * from './src/utils/dictionaryUtils.js';
export * from './src/utils/submissionUtils.js';
export * from './src/utils/submittedDataUtils.js';
export * from './src/utils/types.js';
