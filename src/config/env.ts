import 'dotenv/config';
import type { AppConfig } from '../types/index.js';

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

export const config: AppConfig = {
  botToken: getEnvVar('BOT_TOKEN'),
  dataDir: getEnvVar('DATA_DIR', './data'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  ytdlpPath: process.env.YTDLP_PATH,
  parseTimeout: parseInt(getEnvVar('PARSE_TIMEOUT', '60000'), 10),
};

// Proxy configuration (optional)
export const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;

// Cookies file for yt-dlp (optional, for Facebook/TikTok login)
export const cookiesFile = process.env.YTDLP_COOKIES;
