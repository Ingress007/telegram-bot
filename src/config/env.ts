import 'dotenv/config';
import type { AppConfig } from '../types/index.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

// Environment-specific configuration
export const config: AppConfig = {
  botToken: getEnvVar('BOT_TOKEN'),
  dataDir: getEnvVar('DATA_DIR', './data'),
  logLevel: getEnvVar('LOG_LEVEL', NODE_ENV === 'production' ? 'warn' : 'info'),
  ytdlpPath: process.env.YTDLP_PATH,
  parseTimeout: parseInt(getEnvVar('PARSE_TIMEOUT', '60000'), 10),
};

// Proxy configuration (optional) // 代理配置（可选）
export const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;

// Cookies file for yt-dlp (optional, for Facebook/TikTok login) // yt-dlp的Cookies文件（可选，用于Facebook/TikTok登录）
export const cookiesFile = process.env.YTDLP_COOKIES;

// Export environment info
export const environment = {
  isDevelopment: NODE_ENV === 'development',
  isProduction: NODE_ENV === 'production',
  nodeEnv: NODE_ENV,
};

console.log(`🚀 Running in ${NODE_ENV} mode`);
