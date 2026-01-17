import type { Context, NarrowedContext } from 'telegraf';
import type { Update, CallbackQuery } from 'telegraf/types';
import { getAria2Config, deleteUserConfig } from '../../services/userConfig.js';
import { testConnection, addDownload } from '../../services/aria2Client.js';
import { handleSetupCallback } from '../commands/setAria2.js';
import { getPendingMedia, deletePendingMedia } from './messageHandler.js';

type CallbackContext = NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery.DataQuery>>;

export async function handleCallback(ctx: CallbackContext): Promise<void> {
  const userId = ctx.from?.id;
  const data = ctx.callbackQuery.data;

  if (!userId || !data) {
    await ctx.answerCbQuery('错误');
    return;
  }

  // Handle setup callbacks // 处理设置回调
  if (['cancel_setup', 'skip_secret', 'skip_dir'].includes(data)) {
    await handleSetupCallback(ctx, data);
    return;
  }

  // Handle other callbacks // 处理其他回调
  if (data === 'setup_aria2') {
    await ctx.answerCbQuery();
    await ctx.reply('使用 /set_aria2 命令开始配置 Aria2。');
    return;
  }

  if (data === 'test_aria2') {
    await handleTestAria2(ctx, userId);
    return;
  }

  if (data === 'confirm_delete_config') {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '⚠️ 确定要删除 Aria2 配置吗？',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 确认删除', callback_data: 'do_delete_config' },
              { text: '❌ 取消', callback_data: 'cancel_delete' },
            ],
          ],
        },
      }
    );
    return;
  }

  if (data === 'do_delete_config') {
    deleteUserConfig(userId);
    await ctx.answerCbQuery('已删除');
    await ctx.editMessageText('✅ Aria2 配置已删除。');
    return;
  }

  if (data === 'cancel_delete') {
    await ctx.answerCbQuery('已取消');
    await ctx.deleteMessage();
    return;
  }

  // Handle download callback // 处理下载回调
  if (data.startsWith('download:')) {
    const mediaKey = data.substring(9);
    await handleDownload(ctx, userId, mediaKey);
    return;
  }

  // Handle batch download callback // 处理批量下载回调
  if (data.startsWith('download_all:')) {
    const mediaKey = data.substring(13);
    await handleBatchDownload(ctx, userId, mediaKey);
    return;
  }

  await ctx.answerCbQuery('未知操作');
}

async function handleTestAria2(ctx: CallbackContext, userId: number): Promise<void> {
  const config = getAria2Config(userId);
  
  if (!config) {
    await ctx.answerCbQuery('未配置 Aria2');
    return;
  }

  await ctx.answerCbQuery('正在测试...');

  const result = await testConnection(config);
  
  if (result.success) {
    await ctx.reply(`✅ 连接成功！Aria2 版本: ${result.version}`);
  } else {
    await ctx.reply(`❌ 连接失败: ${result.error}`);
  }
}

async function handleDownload(ctx: CallbackContext, userId: number, mediaKey: string): Promise<void> {
  const media = getPendingMedia(mediaKey);
  
  if (!media) {
    await ctx.answerCbQuery('内容已过期，请重新解析');
    return;
  }

  if (!media.directUrl) {
    await ctx.answerCbQuery('无法获取下载链接');
    await ctx.reply('❌ 无法获取直链，请重新发送链接解析');
    return;
  }

  const config = getAria2Config(userId);
  
  if (!config) {
    await ctx.answerCbQuery('请先配置 Aria2');
    return;
  }

  await ctx.answerCbQuery('正在发送到 Aria2...');

  // Generate filename - preserve original extension if present // 生成文件名 - 如果存在则保留原始扩展名
  const safeTitle = media.title
    .replace(/\s+/g, '')  // Replace all whitespace (spaces, tabs, newlines) with underscores // 将所有空白字符（空格、制表符、换行符）替换为下划线
    .replace(/[<>:"/\\|?*]/g, '')  // Replace other illegal characters // 替换其他非法字符
    .substring(0, 100);
  
  // Check if title already has extension // 检查标题是否已有扩展名
  const hasExtension = /\.\w{2,5}$/.test(safeTitle);
  let filename: string;
  if (hasExtension) {
    filename = safeTitle;
  } else {
    const ext = media.type === 'image' ? 'jpg' : 'mp4';
    filename = `${safeTitle}.${ext}`;
  }

  console.log(`[Download] Sending ${media.type} to Aria2: ${media.directUrl}`);
  
  const result = await addDownload(media.directUrl, config, filename);

  if (result.success) {
    deletePendingMedia(mediaKey);
    await ctx.reply(
      `✅ 已发送到 Aria2 下载\n\n` +
      `📄 文件名: ${filename}\n` +
      `🆔 任务 ID: ${result.gid}`
    );
  } else {
    await ctx.reply(`❌ 发送失败: ${result.error}`);
  }
}

async function handleBatchDownload(ctx: CallbackContext, userId: number, mediaKey: string): Promise<void> {
  const media = getPendingMedia(mediaKey);
  
  if (!media) {
    await ctx.answerCbQuery('内容已过期，请重新解析');
    return;
  }

  const config = getAria2Config(userId);
  
  if (!config) {
    await ctx.answerCbQuery('请先配置 Aria2');
    return;
  }

  await ctx.answerCbQuery('正在批量发送到 Aria2...');

  const safeTitle = media.title
    .replace(/\s+/g, '')  // Replace all whitespace (spaces, tabs, newlines) with underscores // 将所有空白字符（空格、制表符、换行符）替换为下划线
    .replace(/[<>:"/\\|?*]/g, '')  // Replace other illegal characters // 替换其他非法字符
    .substring(0, 80);

  const results: { success: boolean; gid?: string; type: string; index: number; error?: string }[] = [];

  // Handle mixed media: download both videos and images // 处理混合媒体：下载视频和图片
  if (media.type === 'mixed') {
    // Download videos // 下载视频
    if (media.videoUrls && media.videoUrls.length > 0) {
      for (let i = 0; i < media.videoUrls.length; i++) {
        const videoUrl = media.videoUrls[i];
        const filename = `${safeTitle}_v${i + 1}.mp4`;
        
        console.log(`[Download] Sending video ${i + 1}/${media.videoUrls.length} to Aria2: ${videoUrl}`);
        
        const result = await addDownload(videoUrl, config, filename);
        results.push({ ...result, type: 'video', index: i + 1 });
      }
    }
    
    // Download images // 下载图片
    if (media.imageUrls && media.imageUrls.length > 0) {
      for (let i = 0; i < media.imageUrls.length; i++) {
        const imageUrl = media.imageUrls[i];
        const filename = `${safeTitle}_i${i + 1}.jpg`;
        
        console.log(`[Download] Sending image ${i + 1}/${media.imageUrls.length} to Aria2: ${imageUrl}`);
        
        const result = await addDownload(imageUrl, config, filename);
        results.push({ ...result, type: 'image', index: i + 1 });
      }
    }
  } else {
    // Handle single type batch (videos or images) // 处理单一类型批处理（视频或图片）
    const isVideoBatch = media.type === 'videos' && media.videoUrls && media.videoUrls.length > 0;
    const isImageBatch = media.type === 'images' && media.imageUrls && media.imageUrls.length > 0;
    
    const urls = isVideoBatch ? media.videoUrls! : (isImageBatch ? media.imageUrls! : []);
    const ext = isVideoBatch ? 'mp4' : 'jpg';
    const mediaType = isVideoBatch ? 'video' : 'image';

    if (urls.length === 0) {
      await ctx.reply('❌ 无法获取下载链接，请重新发送链接解析');
      return;
    }

    for (let i = 0; i < urls.length; i++) {
      const mediaUrl = urls[i];
      const filename = `${safeTitle}_${i + 1}.${ext}`;
      
      console.log(`[Download] Sending ${mediaType} ${i + 1}/${urls.length} to Aria2: ${mediaUrl}`);
      
      const result = await addDownload(mediaUrl, config, filename);
      results.push({ ...result, type: mediaType, index: i + 1 });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  deletePendingMedia(mediaKey);

  if (successCount === results.length) {
    const gids = results.map(r => r.gid).join(', ');
    const videoCount = results.filter(r => r.type === 'video').length;
    const imageCount = results.filter(r => r.type === 'image').length;
    
    let summary = '';
    if (videoCount > 0) summary += `🎬 (${videoCount})`;
    if (videoCount > 0 && imageCount > 0) summary += '，';
    if (imageCount > 0) summary += `🖼 (${imageCount})`;
    
    await ctx.reply(
      `✅ 已批量发送到 Aria2\n\n` +
      `${summary}\n` +
      `📁 文件名: ${safeTitle}\n` +
      `🆔 任务 IDs: ${gids}`
    );
  } else if (successCount > 0) {
    await ctx.reply(
      `⚠️ 部分发送成功\n\n` +
      `✅ 成功: ${successCount} 个\n` +
      `❌ 失败: ${failCount} 个`
    );
  } else {
    const firstError = results.find(r => r.error)?.error || '未知错误';
    await ctx.reply(`❌ 批量发送失败: ${firstError}`);
  }
}
