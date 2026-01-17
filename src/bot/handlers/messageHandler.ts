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

  // Check if user is in setup flow
  if (isInSetup(userId)) {
    const handled = await handleSetupMessage(ctx);
    if (handled) return;
  }

  // Extract supported URLs
  const urls = extractSupportedUrls(text);
  
  if (urls.length === 0) return;

  // Process each URL
  for (const url of urls) {
    await processMediaUrl(ctx, url, userId);
  }
}

async function processMediaUrl(ctx: TextContext, url: string, userId: number): Promise<void> {
  const platform = detectPlatform(url);

  if (!ctx.chat) return;
  const messageId = ctx.message.message_id;

  // Try video parsing first
  const videoResult = await parseVideo(url);

  if (videoResult.success && videoResult.video) {
    const video = videoResult.video;

    console.log(`[Parse] Video: ${video.title}, DirectURL: ${video.directUrl ? 'YES' : 'NO'}`);

    // Store media info and send media directly
    const mediaKey = `${userId}_${Date.now()}`;
    pendingMedia.set(mediaKey, {
      url: video.url,
      directUrl: video.directUrl,
      title: video.title,
      type: 'video',
    });
    cleanupPendingMedia();

    // Build keyboard (only download button)
    const keyboard = hasAria2Config(userId)
      ? [[Markup.button.callback('发送到Aria2下载', `download:${mediaKey}`)]]
      : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];

    // Send video directly
    if (video.directUrl) {
      await ctx.replyWithVideo(video.directUrl, {
        caption: video.title,
        reply_parameters: { message_id: messageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      }).catch(async () => {
        // If video send fails, send as text with link
        await ctx.reply(`${video.title}\n\n${video.directUrl}`, {
          reply_parameters: { message_id: messageId },
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      });
    }
    return;
  }

  // If video parsing failed, try Twitter API for Twitter links
  if (platform === 'twitter') {
    const twitterResult = await parseTwitter(url);

    if (twitterResult.success && twitterResult.media) {
      const media = twitterResult.media;
      await handleMediaResult(ctx, userId, messageId, media);
      return;
    }
  }

  // Try image parsing for Twitter/Instagram
  if (platform === 'twitter' || platform === 'instagram') {
    const imageResult = await parseImage(url);

    if (imageResult.success && imageResult.media) {
      const media = imageResult.media;
      await handleMediaResult(ctx, userId, messageId, media);
      return;
    }
  }

  // All parsing failed
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

  // Store media info for callback
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

  // Build keyboard (only download button)
  const hasMultipleMedia = isMultiVideo || isMultiImage || isMixed;
  const keyboard = hasAria2Config(userId)
    ? [[Markup.button.callback('发送到Aria2下载', hasMultipleMedia ? `download_all:${mediaKey}` : `download:${mediaKey}`)]]
    : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];

  const caption = media.title;

  // Generate media count text for button message
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
    // Mixed media: send videos and images together as media group
    const mediaGroup: Array<{ type: 'video' | 'photo'; media: string; caption?: string }> = [];
    
    // Add videos
    if (media.videoUrls) {
      for (const videoUrl of media.videoUrls) {
        mediaGroup.push({ type: 'video', media: videoUrl });
      }
    }
    
    // Add images
    if (media.imageUrls) {
      for (const imageUrl of media.imageUrls) {
        mediaGroup.push({ type: 'photo', media: imageUrl });
      }
    }
    
    // Add caption to the last item
    if (mediaGroup.length > 0) {
      mediaGroup[mediaGroup.length - 1].caption = caption;
    }
    
    let sent = false;
    try {
      await ctx.replyWithMediaGroup(mediaGroup.slice(0, 10), {
        reply_parameters: { message_id: replyToMessageId },
      });
      sent = true;
      // Send button separately with media count
      await ctx.reply(getMediaCountText(), {
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[Mixed MediaGroup Error]', err);
    }
    
    // Fallback: send separately if media group fails
    if (!sent) {
      // Send videos first
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
      // Then images
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
      // Send caption and button
      if (sent) {
        await ctx.reply(caption, {
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      }
    }
  } else if (isMultiVideo && media.videoUrls && media.videoUrls.length > 1) {
    // Send multiple videos as media group
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
    
    // Fallback: use thumbnails as preview (Twitter videos are protected)
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
    
    // Final fallback: text with URLs
    if (!sent) {
      await ctx.reply(`${caption}\n\n视频链接:\n${media.videoUrls.join('\n')}`, {
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else if (isMultiImage && media.imageUrls && media.imageUrls.length > 1) {
    // Send multiple images as media group
    const mediaGroup = media.imageUrls.slice(0, 10).map((url, i, arr) => ({
      type: 'photo' as const,
      media: url,
      caption: i === arr.length - 1 ? caption : undefined,
    }));
    try {
      await ctx.replyWithMediaGroup(mediaGroup, {
        reply_parameters: { message_id: replyToMessageId },
      });
      // Send button in separate message with media count
      await ctx.reply(getMediaCountText(), {
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (err) {
      console.error('[MediaGroup Send Error]', err);
      // Fallback: send images one by one
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
    // Send single video - try video first, then thumbnail as fallback
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
    
    // If video failed, try sending thumbnail as preview
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
    
    // Final fallback to text
    if (!sent) {
      await ctx.reply(`${caption}\n\n${media.directUrl}`, {
        reply_parameters: { message_id: replyToMessageId },
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else if (media.directUrl) {
    // Send single image
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
