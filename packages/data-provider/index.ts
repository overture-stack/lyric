// config
export {
	type AppConfig,
	type LoggerConfig,
	type ValidatorEntry,
	type WorkerPoolSettings,
} from './src/config/config.js';
export { connect } from './src/config/db.js';
export { getLogger, type Logger } from './src/config/logger.js';
export { type DbConfig, migrate } from '@overture-stack/lyric-data-model';

// core
export { type ProviderOptions } from './src/core/provider.js';
export { default as provider } from './src/core/provider.js';

// external integrations
export { createKafkaPublisher, type KafkaProducer, type KafkaPublisherConfig } from './src/external/kafkaPublisher.js';

// middleware
export {
	type AuthConfig,
	type CustomAuthenticationHandler,
	type RequestWithUser,
	type UserSession,
	type UserSessionResult,
} from './src/middleware/auth.js';
export { convertUploadErrors } from './src/middleware/convertUploadErrors.js';
export {
	createErrorHandler,
	errorHandler,
	type ErrorHandlerOptions,
	type ErrorResponse,
	type ErrorResponseOverride,
} from './src/middleware/errorHandler.js';
export { limitRequestSize } from './src/middleware/limitRequestSize.js';

// routes
export { default as dictionaryRouters } from './src/routers/dictionaryRouter.js';
export { default as migrationRouter } from './src/routers/migrationRouter.js';
export { default as submissionRouter } from './src/routers/submissionRouter.js';
export { default as submittedDataRouter } from './src/routers/submittedDataRouter.js';

// errors
export {
	BadRequest,
	ContentTooLarge,
	Forbidden,
	InternalServerError,
	LengthRequired,
	LYRIC_ERROR_TYPES,
	NotFound,
	NotImplemented,
	ServiceUnavailable,
	StatusConflict,
	TSVParseError,
	Unauthorized,
} from './src/utils/errors.js';

// utils
export * from './src/utils/dictionaryUtils.js';
export * from './src/utils/submissionUtils.js';
export * from './src/utils/submittedDataUtils.js';
export * from './src/utils/types.js';
