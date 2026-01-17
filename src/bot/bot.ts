import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { config, proxyUrl } from '../config/env.js';
import {
  startCommand,
  helpCommand,
  aria2ConfigCommand,
  deleteConfigCommand,
  setAria2Command,
  testAria2Command,
} from './commands/index.js';
import { handleMessage } from './handlers/messageHandler.js';
import { handleCallback } from './handlers/callbackHandler.js';
import {
  handleTelegramPhoto,
  handleTelegramVideo,
  handleTelegramDocument,
} from './handlers/telegramMediaHandler.js';

function createProxyAgent() {
  if (!proxyUrl) return undefined;
  
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

export function createBot(): Telegraf<Context> {
  const agent = createProxyAgent();
  
  const bot = new Telegraf(config.botToken, {
    telegram: agent ? { agent } : undefined,
  });

  if (agent) {
    console.log(`🌐 Using proxy: ${proxyUrl}`);
  }

  // Error handling middleware
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ 发生错误，请稍后重试。').catch(() => {});
  });

  // Register commands
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('set_aria2', setAria2Command);
  bot.command('aria2_config', aria2ConfigCommand);
  bot.command('delete_config', deleteConfigCommand);
  bot.command('test_aria2', testAria2Command);

  // Handle text messages
  bot.hears(/.*/, async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      await handleMessage(ctx);
    }
  });

  // Handle Telegram media messages
  bot.on('photo', handleTelegramPhoto);
  bot.on('video', handleTelegramVideo);
  bot.on('document', handleTelegramDocument);

  // Handle callback queries
  bot.on('callback_query', (ctx) => {
    if ('data' in ctx.callbackQuery) {
      return handleCallback(ctx as Parameters<typeof handleCallback>[0]);
    }
  });

  return bot;
}

export async function startBot(bot: Telegraf<Context>): Promise<void> {
  // Set bot commands menu (non-blocking)
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: '开始使用' },
      { command: 'help', description: '帮助信息' },
      { command: 'set_aria2', description: '配置 Aria2' },
      { command: 'aria2_config', description: '查看 Aria2 配置' },
      { command: 'test_aria2', description: '测试 Aria2 连接' },
      { command: 'delete_config', description: '删除配置' },
    ]);
    console.log('✅ Bot commands registered');
  } catch (err) {
    console.warn('⚠️ Failed to set commands menu, continuing anyway:', (err as Error).message);
  }

  // Start polling
  console.log('🤖 Bot is starting...');
  
  bot.launch().then(() => {
    console.log('✅ Bot polling started');
  });

  console.log('✅ Bot is running! Send /start in Telegram to test.');

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
