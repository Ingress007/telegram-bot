import type { MediaInfo, Platform } from '../types/index.js';
import { detectPlatform } from './linkDetector.js';

interface ImageParseResult {
  success: boolean;
  media?: MediaInfo;
  error?: string;
}

async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.text();
}

function extractTwitterImages(html: string): string[] {
  const imageSet = new Set<string>();
  
  // Pattern 1: og:image meta tags
  const ogImageRegex = /<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/gi;
  let match;
  while ((match = ogImageRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && url.includes('pbs.twimg.com/media/')) {
      const baseUrl = url.replace(/\?.*$/, '');
      imageSet.add(baseUrl + '?format=jpg&name=large');
    }
  }
  
  // Pattern 2: twitter:image meta tags
  const twitterImageRegex = /<meta\s+(?:property|name)="twitter:image"\s+content="([^"]+)"/gi;
  while ((match = twitterImageRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && url.includes('pbs.twimg.com/media/')) {
      const baseUrl = url.replace(/\?.*$/, '');
      imageSet.add(baseUrl + '?format=jpg&name=large');
    }
  }
  
  // Pattern 3: Direct pbs.twimg.com/media URLs in content
  const directImageRegex = /https?:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+/gi;
  while ((match = directImageRegex.exec(html)) !== null) {
    const baseUrl = match[0];
    imageSet.add(baseUrl + '?format=jpg&name=large');
  }
  
  // Pattern 4: Look for image URLs in JSON-like structures (Twitter embeds)
  const jsonImageRegex = /"media_url_https"\s*:\s*"(https:[^"]+pbs\.twimg\.com\/media\/[^"]+)"/gi;
  while ((match = jsonImageRegex.exec(html)) !== null) {
    let url = match[1].replace(/\\\//g, '/');
    const baseUrl = url.replace(/\?.*$/, '');
    imageSet.add(baseUrl + '?format=jpg&name=large');
  }
  
  // Pattern 5: data-image-url attributes
  const dataImageRegex = /data-image-url="([^"]+pbs\.twimg\.com\/media\/[^"]+)"/gi;
  while ((match = dataImageRegex.exec(html)) !== null) {
    const baseUrl = match[1].replace(/\?.*$/, '');
    imageSet.add(baseUrl + '?format=jpg&name=large');
  }
  
  return Array.from(imageSet);
}

function extractInstagramImages(html: string): string[] {
  const imageSet = new Set<string>();
  
  // Pattern 1: og:image meta tags
  const ogImageRegex = /<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/gi;
  let match;
  while ((match = ogImageRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && (url.includes('cdninstagram.com') || url.includes('instagram.com') || url.includes('fbcdn.net'))) {
      imageSet.add(decodeHtmlEntities(url));
    }
  }
  
  // Pattern 2: Look for display_url in JSON
  const displayUrlRegex = /"display_url"\s*:\s*"([^"]+)"/gi;
  while ((match = displayUrlRegex.exec(html)) !== null) {
    const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) {
      imageSet.add(url);
    }
  }
  
  // Pattern 3: src attributes with instagram CDN
  const srcRegex = /src="(https?:\/\/[^"]*(?:cdninstagram|fbcdn)[^"]+)"/gi;
  while ((match = srcRegex.exec(html)) !== null) {
    const url = decodeHtmlEntities(match[1]);
    if (url.includes('/t51.') || url.includes('/e35/')) {
      imageSet.add(url);
    }
  }
  
  return Array.from(imageSet);
}

function extractTitle(html: string, platform: Platform): string {
  // Try og:title first
  const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch) {
    return decodeHtmlEntities(ogTitleMatch[1]);
  }
  
  // Try twitter:title
  const twitterTitleMatch = html.match(/<meta\s+(?:property|name)="twitter:title"\s+content="([^"]+)"/i);
  if (twitterTitleMatch) {
    return decodeHtmlEntities(twitterTitleMatch[1]);
  }
  
  // Try page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1]);
  }
  
  return `${platform} 图片`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

export async function parseImage(url: string): Promise<ImageParseResult> {
  const platform = detectPlatform(url);
  
  if (platform !== 'twitter' && platform !== 'instagram') {
    return {
      success: false,
      error: '该平台暂不支持图片解析',
    };
  }
  
  try {
    const html = await fetchPageContent(url);
    
    let images: string[] = [];
    if (platform === 'twitter') {
      images = extractTwitterImages(html);
    } else if (platform === 'instagram') {
      images = extractInstagramImages(html);
    }
    
    if (images.length === 0) {
      return {
        success: false,
        error: '未找到图片',
      };
    }
    
    const title = extractTitle(html, platform);
    const mediaType = images.length > 1 ? 'images' : 'image';
    
    const media: MediaInfo = {
      type: mediaType,
      platform,
      title,
      url,
      directUrl: images[0],
      imageUrls: images,
      thumbnail: images[0],
    };
    
    return {
      success: true,
      media,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    return {
      success: false,
      error: `图片解析失败: ${message}`,
    };
  }
}

export function formatImageInfo(media: MediaInfo): string {
  const lines: string[] = [];
  
  const count = media.imageUrls?.length || 1;
  const emoji = count > 1 ? '🖼️' : '🖼';
  
  lines.push(`${emoji} 图片信息\n`);
  lines.push(`📝 标题: ${media.title}`);
  lines.push(`📊 数量: ${count} 张`);
  
  return lines.join('\n');
}
