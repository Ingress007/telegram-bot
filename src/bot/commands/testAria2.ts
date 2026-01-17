import type { Context } from 'telegraf';
import { getAria2Config } from '../../services/userConfig.js';
import { testConnection } from '../../services/aria2Client.js';

export async function testAria2Command(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('❌ 无法获取用户信息');
    return;
  }

  const config = getAria2Config(userId);
  
  if (!config) {
    await ctx.reply('⚙️ 你还没有配置 Aria2。\n\n使用 /set_aria2 开始配置。');
    return;
  }

  await ctx.reply('🔄 正在测试 Aria2 连接...');

  const result = await testConnection(config);
  
  if (result.success) {
    await ctx.reply(
      `✅ 连接成功！\n\n` +
      `📡 Aria2 版本: ${result.version}\n` +
      `🔗 RPC 地址: ${config.rpcUrl}`
    );
  } else {
    await ctx.reply(
      `❌ 连接失败\n\n` +
      `错误: ${result.error}\n\n` +
      `请检查 Aria2 是否正在运行，或使用 /set_aria2 重新配置。`
    );
  }
}
