import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { extractSupportedUrls, detectPlatform } from '../../services/linkDetector.js';
import { parseVideo } from '../../services/videoParser.js';
import { parseImage } from '../../services/imageParser.js';
import { parseTwitter } from '../../services/twitterParser.js';
import { hasAria2Config } from '../../services/userConfig.js';
import { handleSetupMessage, isInSetup } from '../commands/setAria2.js';
import type { MediaType } from '../../types/index.js';

type TextContext = Context & { message: { text: string } };

export interface PendingMedia {
  url: string;
  directUrl: string;
  title: string;
  type: MediaType;
  imageUrls?: string[];
  videoUrls?: string[];
}

const pendingMedia = new Map<string, PendingMedia>();

export async function handleMessage(ctx: TextContext): Promise<void> {
  const userId = ctx.from?.id;
  const text = ctx.message.text;

  if (!userId || !text) return;

  // Check if user is in setup flow // 检查用户是否在设置流程中
  if (isInSetup(userId)) {
    const handled = await handleSetupMessage(ctx);
    if (handled) return;
  }

  // Extract supported URLs // 提取支持的URL
  const urls = extractSupportedUrls(text);
  
  if (urls.length === 0) return;

  // Process each URL // 处理每个URL
  for (const url of urls) {
    await processMediaUrl(ctx, url, userId);
  }
}

async function processMediaUrl(ctx: TextContext, url: string, userId: number): Promise<void> {
  const platform = detectPlatform(url);

  if (!ctx.chat) return;
  const messageId = ctx.message.message_id;

  // Try video parsing first // 首先尝试视频解析
  const videoResult = await parseVideo(url);

  if (videoResult.success && videoResult.video) {
    const video = videoResult.video;

    console.log(`[Parse] Video: ${video.title}, DirectURL: ${video.directUrl ? 'YES' : 'NO'}`);

    // Store media info and send media directly // 存储媒体信息并直接发送媒体
    const mediaKey = `${userId}_${Date.now()}`;
    pendingMedia.set(mediaKey, {
      url: video.url,
      directUrl: video.directUrl,
      title: video.title,
      type: 'video',
    });
    cleanupPendingMedia();

    // Build keyboard (only download button) // 构建键盘（仅下载按钮）
    const keyboard = hasAria2Config(userId)
      ? [[Markup.button.callback('发送到Aria2下载', `download:${mediaKey}`)]]
      : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];

    // Send video directly // 直接发送视频
    if (video.directUrl) {
      await ctx.replyWithVideo(video.directUrl, {
        caption: video.title,
        reply_parameters: { message_id: messageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      }).catch(async () => {
        // If video send fails, send as text with link // 如果视频发送失败，以带链接的文本形式发送
        await ctx.reply(`${video.title}\n\n${video.directUrl}`, {
          reply_parameters: { message_id: messageId },
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      });
    }
    return;
  }

  // If video parsing failed, try Twitter API for Twitter links // 如果视频解析失败，对Twitter链接尝试Twitter API
  if (platform === 'twitter') {
    const twitterResult = await parseTwitter(url);

    if (twitterResult.success && twitterResult.media) {
      const media = twitterResult.media;
      await handleMediaResult(ctx, userId, messageId, media);
      return;
    }
  }

  // Try image parsing for Twitter/Instagram // 对Twitter/Instagram尝试图像解析
  if (platform === 'twitter' || platform === 'instagram') {
    const imageResult = await parseImage(url);

    if (imageResult.success && imageResult.media) {
      const media = imageResult.media;
      await handleMediaResult(ctx, userId, messageId, media);
      return;
    }
  }

  // All parsing failed // 所有解析均失败
  await ctx.reply(`❌ 解析失败\n\n${videoResult.error || '未知错误'}`, {
    reply_parameters: { message_id: messageId },
  });
}

async function handleMediaResult(
  ctx: TextContext,
  userId: number,
  replyToMessageId: number,
  media: import('../../types/index.js').MediaInfo
): Promise<void> {
  const isVideo = media.type === 'video' || media.type === 'videos';
  const isMultiVideo = media.type === 'videos';
  const isMultiImage = media.type === 'images';
  const isMixed = media.type === 'mixed';

  console.log(`[Parse] ${media.type}: ${media.title}, Videos: ${media.videoUrls?.length || 0}, Images: ${media.imageUrls?.length || 0}, Thumbnails: ${media.thumbnails?.length || 0}`);

  // Store media info for callback // 存储回调的媒体信息
  const mediaKey = `${userId}_${Date.now()}`;
  pendingMedia.set(mediaKey, {
    url: media.url,
    directUrl: media.directUrl,
    title: media.title,
    type: media.type,
    imageUrls: media.imageUrls,
    videoUrls: media.videoUrls,
  });

  cleanupPendingMedia();

  // Build keyboard (only download button) // 构建键盘（仅下载按钮）
  const hasMultipleMedia = isMultiVideo || isMultiImage || isMixed;
  const keyboard = hasAria2Config(userId)
    ? [[Markup.button.callback('发送到Aria2下载', hasMultipleMedia ? `download_all:${mediaKey}` : `download:${mediaKey}`)]]
    : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];

  const caption = media.title;

  // Generate media count text for button message // 为按钮消息生成媒体计数文本
  const getMediaCountText = () => {
    const videoCount = media.videoUrls?.length || 0;
    const imageCount = media.imageUrls?.length || 0;
    if (videoCount > 0 && imageCount > 0) {
      return `🎬( ${videoCount} ) + 🖼️( ${imageCount} )`;
    } else if (videoCount > 0) {
      return `🎬( ${videoCount} )`;
    } else if (imageCount > 0) {
      return `🖼️( ${imageCount} )`;
    }
    return '';
  };

  if (isMixed) {
    // Mixed media: send videos and images together as media group // 混合媒体：将视频和图像一起作为媒体组发送
    const mediaGroup: Array<{ type: 'video' | 'photo'; media: string; caption?: string }> = [];
    
    // Add videos // 添加视频
    if (media.videoUrls) {
      for (const videoUrl of media.videoUrls) {
        mediaGroup.push({ type: 'video', media: videoUrl });
      }
    }
    
    // Add images // 添加图像
    if (media.imageUrls) {
      for (const imageUrl of media.imageUrls) {
        mediaGroup.push({ type: 'photo', media: imageUrl });
      }
    }
    
    // Add caption to the last item // 为最后一项添加说明文字
    if (mediaGroup.length > 0) {
      mediaGroup[mediaGroup.length - 1].caption = caption;
    }
    
    let sent = false;
    try {
      await ctx.replyWithMediaGroup(mediaGroup.slice(0, 10), {
        reply_parameters: { message_id: replyToMessageId },
      });
      sent = true;
      // Send button separately with media count // 单独发送带有媒体计数的按钮
      await ctx.reply(getMediaCountText(), {
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[Mixed MediaGroup Error]', err);
    }
    
    // Fallback: send separately if media group fails // 备选方案：如果媒体组发送失败则分别发送
    if (!sent) {
      // Send videos first // 首先发送视频
      if (media.videoUrls) {
        for (const videoUrl of media.videoUrls) {
          try {
            await ctx.replyWithVideo(videoUrl, {
              reply_parameters: !sent ? { message_id: replyToMessageId } : undefined,
            });
            sent = true;
          } catch {}
        }
      }
      // Then images // 然后发送图像
      if (media.imageUrls) {
        for (const imageUrl of media.imageUrls) {
          try {
            await ctx.replyWithPhoto(imageUrl, {
              reply_parameters: !sent ? { message_id: replyToMessageId } : undefined,
            });
            sent = true;
          } catch {}
        }
      }
      // Send caption and button // 发送说明文字和按钮
      if (sent) {
        await ctx.reply(caption, {
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      }
    }
  } else if (isMultiVideo && media.videoUrls && media.videoUrls.length > 1) {
    // Send multiple videos as media group // 将多个视频作为媒体组发送
    const mediaGroup = media.videoUrls.slice(0, 10).map((url, i, arr) => ({
      type: 'video' as const,
      media: url,
      caption: i === arr.length - 1 ? caption : undefined,
    }));
    
    let sent = false;
    try {
      await ctx.replyWithMediaGroup(mediaGroup, {
        reply_parameters: { message_id: replyToMessageId },
      });
      sent = true;
      await ctx.reply(getMediaCountText(), {
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[Video MediaGroup Error]', err);
    }
    
    // Fallback: use thumbnails as preview (Twitter videos are protected) // 备选方案：使用缩略图预览（Twitter视频受保护）
    if (!sent && media.thumbnails && media.thumbnails.length > 0) {
      const thumbGroup = media.thumbnails.slice(0, 10).map((url, i, arr) => ({
        type: 'photo' as const,
        media: url,
        caption: i === arr.length - 1 ? caption : undefined,
      }));
      try {
        await ctx.replyWithMediaGroup(thumbGroup, {
          reply_parameters: { message_id: replyToMessageId },
        });
        sent = true;
        await ctx.reply(getMediaCountText(), {
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      } catch (thumbErr) {
        console.error('[Thumbnail MediaGroup Error]', thumbErr);
      }
    }
    
    // Final fallback: text with URLs // 最终备选方案：带URL的文本
    if (!sent) {
      await ctx.reply(`${caption}\n\n视频链接:\n${media.videoUrls.join('\n')}`, {
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else if (isMultiImage && media.imageUrls && media.imageUrls.length > 1) {
    // Send multiple images as media group // 将多个图像作为媒体组发送
    const mediaGroup = media.imageUrls.slice(0, 10).map((url, i, arr) => ({
      type: 'photo' as const,
      media: url,
      caption: i === arr.length - 1 ? caption : undefined,
    }));
    try {
      await ctx.replyWithMediaGroup(mediaGroup, {
        reply_parameters: { message_id: replyToMessageId },
      });
      // Send button in separate message with media count // 在单独的消息中发送带有媒体计数的按钮
      await ctx.reply(getMediaCountText(), {
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[MediaGroup Send Error]', err);
      // Fallback: send images one by one // 备选方案：逐个发送图像
      for (let i = 0; i < Math.min(media.imageUrls.length, 10); i++) {
        const imageUrl = media.imageUrls[i];
        const isFirst = i === 0;
        const isLast = i === Math.min(media.imageUrls.length, 10) - 1;
        try {
          await ctx.replyWithPhoto(imageUrl, {
            caption: isLast ? caption : undefined,
            reply_parameters: isFirst ? { message_id: replyToMessageId } : undefined,
            reply_markup: isLast ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
          });
        } catch (imgErr) {
          console.error(`[Image ${i + 1} Send Error]`, imgErr);
        }
      }
    }
  } else if (isVideo && media.directUrl) {
    // Send single video - try video first, then thumbnail as fallback // 发送单个视频 - 首先尝试视频，然后使用缩略图作为备选方案
    let sent = false;
    try {
      await ctx.replyWithVideo(media.directUrl, {
        caption,
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        // @ts-ignore - supports_streaming is valid but not in types
        supports_streaming: true,
      });
      sent = true;
    } catch (err) {
      console.error('[Video Send Error]', err);
    }
    
    // If video failed, try sending thumbnail as preview // 如果视频发送失败，尝试发送缩略图预览
    if (!sent && media.thumbnail) {
      try {
        await ctx.replyWithPhoto(media.thumbnail, {
          caption,
          reply_parameters: { message_id: replyToMessageId },
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
        sent = true;
      } catch (err) {
        console.error('[Thumbnail Send Error]', err);
      }
    }
    
    // Final fallback to text // 最终备选方案：文本
    if (!sent) {
      await ctx.reply(`${caption}\n\n${media.directUrl}`, {
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else if (media.directUrl) {
    // Send single image // 发送单个图像
    try {
      await ctx.replyWithPhoto(media.directUrl, {
        caption,
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[Image Send Error]', err);
      await ctx.reply(`${caption}\n\n${media.directUrl}`, {
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  }
}

function cleanupPendingMedia(): void {
  if (pendingMedia.size > 100) {
    const keys = Array.from(pendingMedia.keys());
    for (let i = 0; i < keys.length - 100; i++) {
      pendingMedia.delete(keys[i]);
    }
  }
}

export function getPendingMedia(key: string) {
  return pendingMedia.get(key);
}

export function deletePendingMedia(key: string) {
  pendingMedia.delete(key);
}

export function storePendingMedia(userId: number, media: PendingMedia): string {
  const mediaKey = `${userId}_${Date.now()}`;
  pendingMedia.set(mediaKey, media);
  cleanupPendingMedia();
  return mediaKey;
}
