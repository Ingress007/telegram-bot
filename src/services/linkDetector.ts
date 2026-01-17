import type { Platform } from '../types/index.js';

const PLATFORM_PATTERNS: Record<Platform, RegExp[]> = {
  twitter: [
    /https?:\/\/(www\.)?(twitter|x)\.com\/\w+\/status\/\d+/i,
    /https?:\/\/t\.co\/\w+/i,
  ],
  facebook: [
    /https?:\/\/(www\.|m\.)?facebook\.com\/.*\/videos\//i,
    /https?:\/\/(www\.|m\.)?facebook\.com\/watch/i,
    /https?:\/\/fb\.watch\/\w+/i,
  ],
  tiktok: [
    /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i,
  ],
  instagram: [
    /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/i,
  ],
  youtube: [
    /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i,
    /https?:\/\/(www\.)?youtube\.com\/shorts\//i,
  ],
  telegram: [], // Telegram media handled separately // Telegram媒体单独处理
  unknown: [], // Unknown platform // 未知平台
};

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches || [];
}

export function detectPlatform(url: string): Platform {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (platform === 'unknown') continue;
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return platform as Platform;
      }
    }
  }
  return 'unknown';
}

export function isSupportedUrl(url: string): boolean {
  return detectPlatform(url) !== 'unknown';
}

export function extractSupportedUrls(text: string): string[] {
  const urls = extractUrls(text);
  return urls.filter(isSupportedUrl);
}

export function getPlatformEmoji(platform: Platform): string {
  const emojis: Record<Platform, string> = {
    twitter: '🐦',
    facebook: '📘',
    tiktok: '🎵',
    instagram: '📸',
    youtube: '📺',
    telegram: '✈️',
    unknown: '🔗',
  };
  return emojis[platform];
}

export function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    twitter: 'X (Twitter)',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    telegram: 'Telegram',
    unknown: 'Unknown',
  };
  return names[platform];
}
