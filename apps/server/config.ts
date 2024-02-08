import dotenv from 'dotenv';

export const getServerConfig = () => {
  dotenv.config();
  return {
    port: process.env.PORT || 3030,
    debug_mode: process.env.DEBUG || false,
    upload_limit: process.env.UPLOAD_LIMIT || '50mb',
  };
};
