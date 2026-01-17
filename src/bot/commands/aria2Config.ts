import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getAria2Config, deleteUserConfig } from '../../services/userConfig.js';

export async function aria2ConfigCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('❌ 无法获取用户信息');
    return;
  }

  const aria2Config = getAria2Config(userId);
  
  if (!aria2Config) {
    await ctx.reply(
      '⚙️ 你还没有配置 Aria2。\n\n使用 /set_aria2 开始配置。'
    );
    return;
  }

  const secretDisplay = aria2Config.secret 
    ? `${aria2Config.secret.substring(0, 3)}${'*'.repeat(Math.max(0, aria2Config.secret.length - 3))}`
    : '未设置';

  const configInfo = `
⚙️ 当前 Aria2 配置

🔗 RPC 地址: ${aria2Config.rpcUrl}
🔑 Secret: ${secretDisplay}
📁 下载目录: ${aria2Config.dir || '默认'}
`.trim();

  await ctx.reply(configInfo, Markup.inlineKeyboard([
    [Markup.button.callback('🔄 测试连接', 'test_aria2')],
    [Markup.button.callback('🗑 删除配置', 'confirm_delete_config')],
  ]));
}

export async function deleteConfigCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('❌ 无法获取用户信息');
    return;
  }

  const deleted = deleteUserConfig(userId);
  
  if (deleted) {
    await ctx.reply('✅ Aria2 配置已删除。');
  } else {
    await ctx.reply('ℹ️ 你没有已保存的配置。');
  }
}
