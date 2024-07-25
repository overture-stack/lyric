// config
export { type AppConfig } from './src/config/config.js';
export { default as provider } from './src/core/provider.js';
export { errorHandler } from './src/middleware/errorHandler.js';

// routes
export { default as dictionaryRouters } from './src/routers/dictionaryRouter.js';
export { default as submissionRouter } from './src/routers/submissionRouter.js';
export { default as submittedDataRouter } from './src/routers/submittedDataRouter.js';

// utils
export { default as getDictionaryUtils } from './src/utils/dictionaryUtils.js';
export { default as submissionUtils } from './src/utils/submissionUtils.js';
export { default as submittedDataUtils } from './src/utils/submittedDataUtils.js';
