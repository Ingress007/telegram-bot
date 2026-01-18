import type { Context } from 'telegraf';

export async function helpCommand(ctx: Context): Promise<void> {
  const helpMessage = `
📚 命令帮助

/start - 开始使用，查看欢迎信息
/help - 显示此帮助信息
/set_aria2 - 配置 Aria2 下载服务器
/my_config - 查看当前 Aria2 配置
/delete_config - 删除 Aria2 配置
/test_aria2 - 测试 Aria2 连接

📖 使用说明：

1️⃣ 发送视频链接
直接发送支持平台的视频链接，Bot 会自动解析，并可以选择发送到 Aria2 下载。

2️⃣ 支持的平台
• X (Twitter) - 视频/图片推文
• Telegram - 视频/图片/文件消息
• Instagram - Reels/图片帖子
• Facebook - Reels/图片帖子
• YouTube - Shorts/视频
• TikTok - 短视频

3️⃣ Aria2 下载
配置 Aria2 后，解析完成的视频可以一键发送到 Aria2 下载。

⚙️ Aria2 配置示例：
• 局域网: http://192.168.1.1:6800/jsonrpc
• 公网: http://example.com:6800/jsonrpc

⚠️ 注意事项：
• 需要系统安装 yt-dlp
• 部分视频可能因地区限制无法解析
• Aria2 需启用 RPC 并允许外部访问
`.trim();

  await ctx.reply(helpMessage);
}
