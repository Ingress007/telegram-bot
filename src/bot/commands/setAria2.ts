import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { z } from 'zod';
import { saveUserConfig, getAria2Config } from '../../services/userConfig.js';
import { testConnection } from '../../services/aria2Client.js';
import type { Aria2Config } from '../../types/index.js';

const rpcUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: '请输入有效的 HTTP/HTTPS URL' }
);

interface SessionData {
  step: 'idle' | 'awaiting_url' | 'awaiting_secret' | 'awaiting_dir';
  tempConfig?: Partial<Aria2Config>;
}

const userSessions = new Map<number, SessionData>();

function getSession(userId: number): SessionData {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { step: 'idle' });
  }
  return userSessions.get(userId)!;
}

function clearSession(userId: number): void {
  userSessions.delete(userId);
}

export async function setAria2Command(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('❌ 无法获取用户信息');
    return;
  }

  const existingConfig = getAria2Config(userId);
  const session = getSession(userId);
  session.step = 'awaiting_url';
  session.tempConfig = {};

  let message = '⚙️ 配置 Aria2 下载服务器\n\n';
  
  if (existingConfig) {
    message += `当前配置: ${existingConfig.rpcUrl}\n\n`;
  }
  
  message += '📝 请输入 Aria2 RPC 地址：\n\n';
  message += '格式: http://host:port/jsonrpc\n\n';
  message += '示例:\n';
  message += '• 局域网: http://192.168.1.1:6800/jsonrpc\n';
  message += '• 内网穿透: http://your-domain:6800/jsonrpc\n';
  message += '• OpenWrt: http://openwrt.lan:6800/jsonrpc';

  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('❌ 取消', 'cancel_setup')],
  ]));
}

export async function handleSetupMessage(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = 'text' in ctx.message! ? ctx.message.text : undefined;
  
  if (!userId || !text) return false;

  const session = getSession(userId);
  
  if (session.step === 'idle') return false;

  switch (session.step) {
    case 'awaiting_url': {
      const result = rpcUrlSchema.safeParse(text.trim());
      
      if (!result.success) {
        await ctx.reply(
          '❌ 无效的 URL 格式\n\n请输入有效的 HTTP/HTTPS URL，例如:\nhttp://localhost:6800/jsonrpc',
          Markup.inlineKeyboard([[Markup.button.callback('❌ 取消', 'cancel_setup')]])
        );
        return true;
      }

      session.tempConfig!.rpcUrl = result.data;
      session.step = 'awaiting_secret';

      await ctx.reply(
        '🔑 请输入 Aria2 RPC Secret（密钥）：\n\n如果没有设置密钥，请输入 "无" 或点击跳过。',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭ 跳过（无密钥）', 'skip_secret')],
          [Markup.button.callback('❌ 取消', 'cancel_setup')],
        ])
      );
      return true;
    }

    case 'awaiting_secret': {
      const secret = text.trim();
      if (secret !== '无' && secret !== 'none' && secret !== '') {
        session.tempConfig!.secret = secret;
      }
      session.step = 'awaiting_dir';

      await ctx.reply(
        '📁 请输入下载目录（可选）：\n\n如果使用 Aria2 默认目录，请点击跳过。',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭ 跳过（默认目录）', 'skip_dir')],
          [Markup.button.callback('❌ 取消', 'cancel_setup')],
        ])
      );
      return true;
    }

    case 'awaiting_dir': {
      const dir = text.trim();
      if (dir && dir !== '无' && dir !== 'none') {
        session.tempConfig!.dir = dir;
      }
      await finishSetup(ctx, userId, session);
      return true;
    }

    default:
      return false;
  }
}

export async function handleSetupCallback(ctx: Context, action: string): Promise<boolean> {
  const userId = ctx.from?.id;
  
  if (!userId) return false;

  const session = getSession(userId);

  switch (action) {
    case 'cancel_setup':
      clearSession(userId);
      await ctx.answerCbQuery('已取消');
      await ctx.editMessageText('❌ 配置已取消。');
      return true;

    case 'skip_secret':
      if (session.step !== 'awaiting_secret') return false;
      session.step = 'awaiting_dir';
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        '📁 请输入下载目录（可选）：\n\n如果使用 Aria2 默认目录，请点击跳过。',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭ 跳过（默认目录）', 'skip_dir')],
          [Markup.button.callback('❌ 取消', 'cancel_setup')],
        ])
      );
      return true;

    case 'skip_dir':
      if (session.step !== 'awaiting_dir') return false;
      await ctx.answerCbQuery();
      await finishSetup(ctx, userId, session);
      return true;

    default:
      return false;
  }
}

async function finishSetup(ctx: Context, userId: number, session: SessionData): Promise<void> {
  const config = session.tempConfig as Aria2Config;
  
  await ctx.reply('🔄 正在测试连接...');
  
  const testResult = await testConnection(config);
  
  if (testResult.success) {
    saveUserConfig(userId, config, ctx.from?.username);
    clearSession(userId);
    
    await ctx.reply(
      `✅ 配置成功！\n\n` +
      `📡 Aria2 版本: ${testResult.version}\n` +
      `🔗 RPC 地址: ${config.rpcUrl}\n` +
      `📁 下载目录: ${config.dir || '默认'}\n\n` +
      `现在你可以发送视频链接，解析后点击"发送到 Aria2"下载。`
    );
  } else {
    await ctx.reply(
      `❌ 连接测试失败\n\n` +
      `错误: ${testResult.error}\n\n` +
      `请检查:\n` +
      `1. Aria2 是否正在运行\n` +
      `2. RPC 地址是否正确\n` +
      `3. Secret 是否正确\n\n` +
      `使用 /set_aria2 重新配置。`
    );
    clearSession(userId);
  }
}

export function isInSetup(userId: number): boolean {
  const session = userSessions.get(userId);
  return session ? session.step !== 'idle' : false;
}
