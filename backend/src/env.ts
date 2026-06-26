import 'dotenv/config';

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'dev-enc-key-32bytes-here!!',
  STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'local',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.qq.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '465', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_USER || '',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  AMAP_API_KEY: process.env.AMAP_API_KEY || '',
  DB_PATH: process.env.DB_PATH || './data/db.sqlite',
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
} as const;
