import type { Context } from 'telegraf';
import { hasAria2Config } from '../../services/userConfig.js';

export async function startCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name || '用户';
  
  const hasConfig = userId ? hasAria2Config(userId) : false;
  
  const welcomeMessage = `
👋 你好，${username}！

我是视频下载Bot，可以帮你解析以下平台的视频链接：

X (Twitter)
Telegram
YouTube
Facebook
Instagram
TikTok

📖 使用方法：
直接发送视频链接给我，我会解析并返回下载信息，你可以选择发送到 Aria2 下载。

${hasConfig ? '✅ 你已配置 Aria2，可以直接发送视频到 Aria2 下载。' : '⚙️ 使用 /set_aria2 配置 Aria2 后，可以一键发送下载任务。'}

💡 输入 /help 查看更多命令。
`.trim();

  await ctx.reply(welcomeMessage);
}
