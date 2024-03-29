// config
export { AppConfig } from './src/config/config.js';
export { default as provider } from './src/core/provider.js';
export { errorHandler } from './src/middleware/errorHandler.js';

// routes
export { default as dictionaryRouters } from './src/routers/dictionaryRouter.js';
export { default as submissionRouter } from './src/routers/submissionRouter.js';

// utils
export { default as getCategoryUtils } from './src/utils/categoryUtils.js';
export { default as getDictionaryUtils } from './src/utils/dictionaryUtils.js';
