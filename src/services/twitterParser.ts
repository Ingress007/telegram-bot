import type { MediaInfo, Platform } from '../types/index.js';

interface VxTwitterResponse {
  tweetID: string;
  text: string;
  user_name: string;
  user_screen_name: string;
  hasMedia: boolean;
  mediaURLs: string[];
  media_extended: Array<{
    type: 'video' | 'image' | 'gif';
    url: string;
    thumbnail_url?: string;
    size?: { width: number; height: number };
    duration_millis?: number;
  }>;
}

interface TwitterParseResult {
  success: boolean;
  media?: MediaInfo;
  error?: string;
}

function extractTweetId(url: string): string | null {
  // Match patterns like: // 匹配以下模式:
  // https://twitter.com/user/status/123456789 // https://twitter.com/user/status/123456789
  // https://x.com/user/status/123456789 // https://x.com/user/status/123456789
  // https://mobile.twitter.com/user/status/123456789 // https://mobile.twitter.com/user/status/123456789
  const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
  return match ? match[1] : null;
}

export async function parseTwitter(url: string): Promise<TwitterParseResult> {
  const tweetId = extractTweetId(url);
  
  if (!tweetId) {
    return {
      success: false,
      error: '无法提取推文 ID',
    };
  }

  try {
    // Use vxtwitter API // 使用vxtwitter API
    // Use vxtwitter API
    const apiUrl = `https://api.vxtwitter.com/Twitter/status/${tweetId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'TelegramBot/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const data = await response.json() as VxTwitterResponse;

    if (!data.hasMedia || !data.mediaURLs || data.mediaURLs.length === 0) {
      return {
        success: false,
        error: '该推文没有媒体内容',
      };
    }

    const mediaExtended = data.media_extended || [];
    
    // Separate videos and images // 分离视频和图片
    const videoItems = mediaExtended.filter(m => m.type === 'video' || m.type === 'gif');
    const imageItems = mediaExtended.filter(m => m.type === 'image');
    
    // Collect all video URLs // 收集所有视频URL
    const videoUrls = videoItems.map(v => v.url).filter(Boolean);
    
    // Collect all image URLs with high quality // 收集所有高质量图片URL
    const imageUrls = imageItems
      .map(img => img.url)
      .filter(Boolean)
      .map(u => {
        if (u.includes('pbs.twimg.com/media/')) {
          return u.replace(/\?.*$/, '') + '?format=jpg&name=large';
        }
        return u;
      });

    // Clean up tweet text by removing newlines and extra spaces // 清理推文文本，移除换行符和多余空格
    const cleanedTweetText = data.text ? data.text.replace(/\s+/g, ' ').trim() : '';
    
    const title = cleanedTweetText
      ? `${data.user_name}: ${cleanedTweetText.substring(0, 50)}${cleanedTweetText.length > 50 ? '...' : ''}`
      : `@${data.user_screen_name} 的推文`;

    if (videoUrls.length > 0) {
      // Video content (single or multiple, possibly with images) // 视频内容（单个或多个，可能包含图片）
      // Video content (single or multiple, possibly with images)
      const firstVideo = videoItems[0];
      // Collect all video thumbnails // 收集所有视频缩略图
      const thumbnails = videoItems.map(v => v.thumbnail_url).filter(Boolean) as string[];
      
      // Determine type: mixed if both videos and images exist // 确定类型：如果同时存在视频和图片，则为混合类型
      let type: 'video' | 'videos' | 'mixed';
      if (imageUrls.length > 0 && videoUrls.length > 0) {
        type = 'mixed';
      } else if (videoUrls.length > 1) {
        type = 'videos';
      } else {
        type = 'video';
      }
      
      const media: MediaInfo = {
        type,
        platform: 'twitter' as Platform,
        title,
        url,
        directUrl: videoUrls[0],
        videoUrls: videoUrls.length > 0 ? videoUrls : undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
        thumbnail: firstVideo?.thumbnail_url,
        duration: firstVideo?.duration_millis ? Math.floor(firstVideo.duration_millis / 1000) : undefined,
        resolution: firstVideo?.size ? `${firstVideo.size.width}x${firstVideo.size.height}` : undefined,
      };

      return { success: true, media };
    } else if (imageUrls.length > 0) {
      // Image content // 图片内容
      // Image content
      const media: MediaInfo = {
        type: imageUrls.length > 1 ? 'images' : 'image',
        platform: 'twitter' as Platform,
        title,
        url,
        directUrl: imageUrls[0],
        imageUrls: imageUrls.length > 1 ? imageUrls : undefined,
        thumbnail: imageUrls[0],
      };

      return { success: true, media };
    }

    return {
      success: false,
      error: '无法解析媒体内容',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    return {
      success: false,
      error: `Twitter 解析失败: ${message}`,
    };
  }
}
