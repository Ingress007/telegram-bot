import type { Context, NarrowedContext } from 'telegraf';
import type { Update, Message } from 'telegraf/types';
import { Markup } from 'telegraf';
import { config } from '../../config/env.js';
import { hasAria2Config } from '../../services/userConfig.js';
import {
  getFileDownloadUrl,
  getExtensionFromMime,
  generateFileName,
} from '../../services/telegramFileService.js';
import { storePendingMedia, type PendingMedia } from './messageHandler.js';

type PhotoContext = NarrowedContext<Context<Update>, Update.MessageUpdate<Message.PhotoMessage>>;
type VideoContext = NarrowedContext<Context<Update>, Update.MessageUpdate<Message.VideoMessage>>;
type DocumentContext = NarrowedContext<Context<Update>, Update.MessageUpdate<Message.DocumentMessage>>;

interface MediaGroupItem {
  fileId: string;
  fileUniqueId: string;
  fileName: string;
  fileSize?: number;
  type: 'photo' | 'video' | 'document';
  url?: string;
}

// Buffer for collecting media group items // 用于收集媒体组项目的缓冲区 // 用于收集媒体组项目的缓冲区
const mediaGroupBuffer = new Map<string, {
  items: MediaGroupItem[];
  timer: NodeJS.Timeout;
  userId: number;
  messageId: number;
}>();

const MEDIA_GROUP_DELAY = 500; // ms to wait for all media group items // 毫秒，等待所有媒体组项目 // 毫秒，等待所有媒体组项目

/**
 * 处理Telegram照片消息
 * Handle Telegram photo message
 */
export async function handleTelegramPhoto(ctx: PhotoContext): Promise<void> {
  const userId = ctx.from?.id;
  const messageId = ctx.message.message_id;
  const mediaGroupId = ctx.message.media_group_id;
  
  if (!userId) return;
  
  // Get largest photo size
  const photos = ctx.message.photo;
  const largestPhoto = photos[photos.length - 1];
  
  // If part of media group, buffer it
  if (mediaGroupId) {
    await bufferMediaGroupItem(ctx, mediaGroupId, {
      fileId: largestPhoto.file_id,
      fileUniqueId: largestPhoto.file_unique_id,
      fileName: `photo_${largestPhoto.file_unique_id}.jpg`,
      fileSize: largestPhoto.file_size,
      type: 'photo',
    }, userId, messageId);
    return;
  }
  
  // Single photo - process immediately
  const result = await getFileDownloadUrl(ctx.telegram, largestPhoto.file_id, config.botToken);
  
  if (!result.success || !result.url) {
    await ctx.reply(`❌ 无法获取文件下载链接\n${result.error || ''}`, {
      reply_parameters: { message_id: messageId },
    });
    return;
  }
  
  const fileName = `photo_${largestPhoto.file_unique_id}.jpg`;
  await sendDownloadButton(ctx, userId, messageId, {
    url: result.url,
    directUrl: result.url,
    title: fileName,
    type: 'image',
  });
}

/**
 * 处理Telegram视频消息
 * Handle Telegram video message
 */
export async function handleTelegramVideo(ctx: VideoContext): Promise<void> {
  const userId = ctx.from?.id;
  const messageId = ctx.message.message_id;
  const mediaGroupId = ctx.message.media_group_id;
  const video = ctx.message.video;
  
  if (!userId) return;
  
  const fileName = video.file_name || `video_${video.file_unique_id}.mp4`;
  
  // If part of media group, buffer it
  if (mediaGroupId) {
    await bufferMediaGroupItem(ctx, mediaGroupId, {
      fileId: video.file_id,
      fileUniqueId: video.file_unique_id,
      fileName,
      fileSize: video.file_size,
      type: 'video',
    }, userId, messageId);
    return;
  }
  
  // Single video - process immediately
  const result = await getFileDownloadUrl(ctx.telegram, video.file_id, config.botToken);
  
  if (!result.success || !result.url) {
    await ctx.reply(`❌ 无法获取文件下载链接\n${result.error || ''}`, {
      reply_parameters: { message_id: messageId },
    });
    return;
  }
  
  await sendDownloadButton(ctx, userId, messageId, {
    url: result.url,
    directUrl: result.url,
    title: fileName,
    type: 'video',
  });
}

/**
 * 处理Telegram文档消息
 * Handle Telegram document message
 */
export async function handleTelegramDocument(ctx: DocumentContext): Promise<void> {
  const userId = ctx.from?.id;
  const messageId = ctx.message.message_id;
  const doc = ctx.message.document;
  
  if (!userId) return;
  
  // Generate filename
  let fileName = doc.file_name;
  if (!fileName) {
    const ext = getExtensionFromMime(doc.mime_type);
    fileName = generateFileName('file', ext, doc.file_unique_id);
  }
  
  // Get download URL
  const result = await getFileDownloadUrl(ctx.telegram, doc.file_id, config.botToken);
  
  if (!result.success || !result.url) {
    await ctx.reply(`❌ 无法获取文件下载链接\n${result.error || ''}`, {
      reply_parameters: { message_id: messageId },
    });
    return;
  }
  
  // Determine type based on mime
  const mimeType = doc.mime_type || '';
  let type: 'video' | 'image' = 'image';
  if (mimeType.startsWith('video/')) {
    type = 'video';
  }
  
  await sendDownloadButton(ctx, userId, messageId, {
    url: result.url,
    directUrl: result.url,
    title: fileName,
    type,
  });
}

/**
 * 缓冲媒体组项目并在延迟后处理
 * Buffer media group item and process after delay
 */
async function bufferMediaGroupItem(
  ctx: Context,
  mediaGroupId: string,
  item: MediaGroupItem,
  userId: number,
  messageId: number
): Promise<void> {
  const existing = mediaGroupBuffer.get(mediaGroupId);
  
  if (existing) {
    // Add to existing buffer // 添加到现有缓冲区
    existing.items.push(item);
    existing.messageId = messageId; // Update to latest message // 更新为最新消息
    
    // Reset timer // 重置定时器
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => {
      processMediaGroup(ctx, mediaGroupId);
    }, MEDIA_GROUP_DELAY);
  } else {
    // Create new buffer // 创建新缓冲区
    const timer = setTimeout(() => {
      processMediaGroup(ctx, mediaGroupId);
    }, MEDIA_GROUP_DELAY);
    
    mediaGroupBuffer.set(mediaGroupId, {
      items: [item],
      timer,
      userId,
      messageId,
    });
  }
}

/**
 * 处理缓冲的媒体组
 * Process buffered media group
 */
async function processMediaGroup(ctx: Context, mediaGroupId: string): Promise<void> {
  const group = mediaGroupBuffer.get(mediaGroupId);
  if (!group) return;
  
  mediaGroupBuffer.delete(mediaGroupId);
  
  const { items, userId, messageId } = group;
  
  // Get download URLs for all items // 获取所有项目的下载URL
  const urls: string[] = [];
  const fileNames: string[] = [];
  let hasPhotos = false;
  let hasVideos = false;
  
  for (const item of items) {
    const result = await getFileDownloadUrl(ctx.telegram, item.fileId, config.botToken);
    if (result.success && result.url) {
      urls.push(result.url);
      fileNames.push(item.fileName);
      if (item.type === 'photo') hasPhotos = true;
      if (item.type === 'video') hasVideos = true;
    }
  }
  
  if (urls.length === 0) {
    await ctx.reply('❌ 无法获取文件下载链接', {
      reply_parameters: { message_id: messageId },
    });
    return;
  }
  
  // Determine type // 确定类型
  let type: 'images' | 'videos' | 'mixed';
  if (hasPhotos && hasVideos) {
    type = 'mixed';
  } else if (hasVideos) {
    type = 'videos';
  } else {
    type = 'images';
  }
  
  // Generate media count text // 生成媒体计数文本
  const photoCount = items.filter(i => i.type === 'photo').length;
  const videoCount = items.filter(i => i.type === 'video').length;
  let countText = '';
  if (videoCount > 0 && photoCount > 0) {
    countText = `🎬(${videoCount}) + 🖼️(${photoCount})`;
  } else if (videoCount > 0) {
    countText = `🎬(${videoCount})`;
  } else if (photoCount > 0) {
    countText = `🖼️(${photoCount})`;
  }
  
  // Store and send button // 存储并发送按钮
  const mediaKey = storePendingMedia(userId, {
    url: urls[0],
    directUrl: urls[0],
    title: `telegram_group_${mediaGroupId}`,
    type,
    imageUrls: hasPhotos ? urls.filter((_, i) => items[i].type === 'photo') : undefined,
    videoUrls: hasVideos ? urls.filter((_, i) => items[i].type === 'video') : undefined,
  });
  
  const keyboard = hasAria2Config(userId)
    ? [[Markup.button.callback('发送到Aria2下载', `download_all:${mediaKey}`)]]
    : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];
  
  await ctx.reply(countText, {
    reply_parameters: { message_id: messageId },
    reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
  });
}

/**
 * 发送单个媒体的下载按钮
 * Send download button for single media
 */
async function sendDownloadButton(
  ctx: Context,
  userId: number,
  messageId: number,
  media: Omit<PendingMedia, 'imageUrls' | 'videoUrls'>
): Promise<void> {
  const mediaKey = storePendingMedia(userId, media);
  
  const keyboard = hasAria2Config(userId)
    ? [[Markup.button.callback('发送到Aria2下载', `download:${mediaKey}`)]]
    : [[Markup.button.callback('配置 Aria2', 'setup_aria2')]];
  
  // Use filename as message text (Telegram requires non-empty text) 
  // 使用文件名作为消息文本（Telegram要求非空文本）
  await ctx.reply(media.title, {
    reply_parameters: { message_id: messageId },
    reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
  });
}
