# Telegram Video Bot 开发文档

## 1. 项目概览

- 名称：Telegram Video Bot  
- 主要功能：
  - 识别聊天中的视频/图片链接（X/Twitter、Facebook、TikTok、Instagram、YouTube）
  - 使用 `yt-dlp` 或第三方 API 解析媒体信息
  - 在 Telegram 中展示解析结果（标题、时长、分辨率、数量等）
  - 将媒体单个或批量发送到 Aria2 进行下载
- 运行环境：
  - Node.js >= 18（ESM）
  - TypeScript

## 2. 目录结构概览

```text
.
├─ src
│  ├─ bot
│  │  ├─ commands      # Telegram 命令处理
│  │  ├─ handlers      # 消息与回调处理
│  │  └─ bot.ts        # Bot 创建与启动
│  ├─ config           # 环境配置读取
│  ├─ services         # 业务服务（解析、Aria2、用户配置等）
│  ├─ types            # TypeScript 类型定义
│  └─ index.ts         # 程序入口
├─ data
│  └─ users.json       # 用户配置持久化（运行时生成）
├─ package.json
├─ tsconfig.json
└─ .env / .env.example
```

## 3. 启动与运行

### 3.1 安装依赖

```bash
npm install
```

### 3.2 环境配置

在项目根目录创建 `.env`，参考 `.env.example`，主要变量：

- `BOT_TOKEN`：Telegram Bot Token（必需）
- `DATA_DIR`：用户数据目录，默认 `./data`
- `LOG_LEVEL`：日志级别，默认 `info`
- `YTDLP_PATH`：`yt-dlp` 可执行文件路径（建议显式配置）
- `PARSE_TIMEOUT`：解析超时时间，默认 `60000` 毫秒
- `HTTPS_PROXY` / `HTTP_PROXY` / `PROXY_URL`：可选代理地址
- `YTDLP_COOKIES`：yt-dlp cookies 文件路径（支持登录后才能访问的视频）

### 3.3 本地开发

```bash
# 开发模式（热重载）
npm run dev

# 编译 TypeScript
npm run build

# 运行编译产物
npm start

# 仅类型检查
npm run typecheck
```

## 4. 核心模块说明

### 4.1 程序入口与 Bot 启动

- `src/index.ts`
  - 导入 `createBot` 和 `startBot`，负责整体启动和错误兜底。
- `src/bot/bot.ts`
  - `createBot()`：
    - 使用 `config.botToken` 创建 Telegraf 实例。
    - 如果 `proxyUrl` 存在，创建 HTTP/SOCKS 代理并注入。
    - 注册全局错误处理，统一回复“发生错误，请稍后重试”。
    - 注册命令：
      - `/start`、`/help`
      - `/set_aria2`、`/aria2_config`、`/delete_config`、`/test_aria2`
    - 注册文本消息路由到 `handleMessage`。
    - 注册回调查询路由到 `handleCallback`。
  - `startBot(bot)`：
    - 调用 `bot.telegram.setMyCommands` 设置命令菜单。
    - 调用 `bot.launch()` 开始轮询。
    - 注册 `SIGINT` 和 `SIGTERM` 信号以优雅停止。

### 4.2 配置模块

- `src/config/env.ts`
  - 通过 `dotenv` 加载 `.env`。
  - `getEnvVar` 封装必需/可选环境变量读取逻辑。
  - 导出：
    - `config: AppConfig`（botToken、dataDir、logLevel、ytdlpPath、parseTimeout）
    - `proxyUrl`：从 `HTTPS_PROXY` / `HTTP_PROXY` / `PROXY_URL` 中获取。
    - `cookiesFile`：从 `YTDLP_COOKIES` 获取。

### 4.3 命令模块

- `src/bot/commands/start.ts`
  - `/start`：欢迎信息、支持平台列表、基础使用说明。
  - 根据用户是否已配置 Aria2，展示不同提示。

- `src/bot/commands/help.ts`
  - `/help`：列出常用命令和支持平台，说明 Aria2 配置注意事项。

- `src/bot/commands/aria2Config.ts`
  - `/aria2_config`：
    - 读取当前用户的 Aria2 配置并展示。
    - 使用内联键盘提供“测试连接”和“删除配置”按钮。
  - `/delete_config`：
    - 直接删除当前用户配置（不经过确认）。

- `src/bot/commands/setAria2.ts`
  - `/set_aria2`：启动 Aria2 配置向导。
  - 使用内存 `userSessions: Map<number, SessionData>` 管理每个用户的配置步骤：
    - `awaiting_url` → 输入 RPC 地址，使用 zod + URL 校验，仅允许 HTTP/HTTPS。
    - `awaiting_secret` → 输入 RPC Secret，可输入“无”或点击跳过。
    - `awaiting_dir` → 输入下载目录，可输入“无”或点击跳过。
  - `handleSetupMessage(ctx)`：
    - 在消息处理阶段根据 `SessionData.step` 处理用户输入。
  - `handleSetupCallback(ctx, action)`：
    - 处理“取消/跳过”类回调按钮。
  - `finishSetup`：
    - 调用 `aria2Client.testConnection` 测试。
    - 成功则通过 `userConfig.saveUserConfig` 写入本地 JSON。
  - `isInSetup(userId)`：
    - 用于消息处理器判断当前用户是否处于配置流程中。

- `src/bot/commands/testAria2.ts`
  - `/test_aria2`：
    - 若用户已配置 Aria2，则调用 `testConnection` 并返回版本信息。

### 4.4 消息与回调处理

- `src/bot/handlers/messageHandler.ts`
  - `handleMessage(ctx)`：
    - 若用户处于 Aria2 配置流程，优先由 `handleSetupMessage` 消费该消息。
    - 使用 `extractSupportedUrls` 从文本中提取所有支持平台链接。
    - 对每个链接调用 `processMediaUrl`。
  - `processMediaUrl(ctx, url, userId)`：
    - `detectPlatform(url)` 得到平台信息和展示用的 emoji/name。
    - 先回复一条“正在解析”状态消息。
    - 优先调用 `videoParser.parseVideo`：
      - 成功则使用 `formatVideoInfo` 生成文案。
      - 在 `pendingMedia` 中缓存媒体信息（键为 `${userId}_${Date.now()}`）。
      - 根据是否配置 Aria2，构建内联键盘：
        - 在线播放链接按钮。
        - “发送到 Aria2”或“配置 Aria2”按钮。
      - 用 `editMessageText` 替换状态消息。
    - 若视频解析失败且平台为 Twitter：
      - 调用 `twitterParser.parseTwitter`，解析多图/多视频。
    - 若平台为 Twitter/Instagram：
      - 调用 `imageParser.parseImage`，从 HTML 中抓取图片。
    - 若所有解析都失败：
      - 将状态消息替换为“解析失败”及错误原因。
  - `handleMediaResult`：
    - 统一处理 `MediaInfo`（video/videos/image/images）。
    - 根据类型构建不同的内联键盘（单个下载、批量下载）。
  - `pendingMedia`：
    - 内存缓存待下载媒体，用于回调中查找。
    - `cleanupPendingMedia` 限制缓存数量最多 100 条。
    - 对外暴露 `getPendingMedia` 和 `deletePendingMedia`。

- `src/bot/handlers/callbackHandler.ts`
  - `handleCallback(ctx)`：
    - 路由所有 callback_data：
      - Aria2 配置相关：`cancel_setup`、`skip_secret`、`skip_dir`。
      - 配置入口：`setup_aria2`。
      - 测试连接：`test_aria2`。
      - 删除配置二次确认：`confirm_delete_config`、`do_delete_config`、`cancel_delete`。
      - 下载相关：`download:<key>`、`download_all:<key>`。
  - `handleTestAria2(ctx, userId)`：
    - 对当前用户配置调用 `testConnection` 并反馈结果。
  - `handleDownload(ctx, userId, mediaKey)`：
    - 从 `pendingMedia` 获取媒体信息。
    - 校验 `directUrl` 和 Aria2 配置。
    - 根据媒体类型构造安全文件名（处理非法字符并截断长度）。
    - 调用 `aria2Client.addDownload` 发送任务。
  - `handleBatchDownload(ctx, userId, mediaKey)`：
    - 支持多视频或多图片批量发送下载任务。
    - 生成带序号的文件名，并统计成功/失败数量。

## 5. 解析服务

### 5.1 平台检测与链接提取

- `src/services/linkDetector.ts`
  - 为每个平台定义正则模式，用于判定链接所属平台。
  - `extractSupportedUrls(text)`：
    - 从文本中提取所有 URL，再过滤出支持的平台。
  - `detectPlatform(url)`、`getPlatformEmoji`、`getPlatformName`：
    - 统一平台识别与展示。

### 5.2 视频解析（yt-dlp）

- `src/services/videoParser.ts`
  - 使用 `yt-dlp-wrap` 调用本地 `yt-dlp`，支持通过 `cookiesFile` 传入 cookies。
  - `parseVideo(url)`：
    - 检查平台是否支持。
    - 通过 `Promise.race` 加入解析超时控制。
    - 从 `formats` 中筛选出 HTTPS MP4 视频（排除 HLS）。
    - 选择最佳直链和分辨率，组装为 `VideoInfo`。
  - `formatVideoInfo(video)`：
    - 输出包含标题、时长、分辨率和大小的文本，用于直接发送到 Telegram。

### 5.3 图片解析（HTML 爬取）

- `src/services/imageParser.ts`
  - 仅支持 Twitter 和 Instagram 图片解析。
  - `parseImage(url)`：
    - 使用 `fetchPageContent` 抓取 HTML。
    - Twitter：
      - 解析 `og:image`、`twitter:image`、`pbs.twimg.com/media`、JSON 中的 `media_url_https` 等多种来源。
    - Instagram：
      - 解析 `og:image`、`display_url` 和 CDN 图片标签。
    - 组装 `MediaInfo`，包含所有图片 URL，支持多图下载。
  - `formatImageInfo(media)`：
    - 输出标题与图片数量。

### 5.4 Twitter API 解析（vxtwitter）

- `src/services/twitterParser.ts`
  - `parseTwitter(url)`：
    - 从推文链接中提取 Tweet ID。
    - 调用 `https://api.vxtwitter.com/Twitter/status/{tweetId}`。
    - 将 `media_extended` 映射为 `MediaInfo`：
      - 支持多视频（`videos`）和多图（`images`）。
    - 返回给 `handleMediaResult` 用于统一渲染和下载。

## 6. 用户配置与持久化

- `src/services/userConfig.ts`
  - 数据文件：`${config.dataDir}/users.json`。
  - `readDatabase` / `writeDatabase`：
    - 使用同步文件读写，结构为：
      - `UsersDatabase { users: Record<string, UserData> }`。
  - 对外接口：
    - `getUserConfig(userId)`、`getAria2Config(userId)`、`hasAria2Config(userId)`。
    - `saveUserConfig(userId, aria2Config, username?)`。
    - `deleteUserConfig(userId)`。
  - `UserData` 中包含创建时间与更新时间，便于后续扩展审计功能。

## 7. Aria2 集成

- `src/services/aria2Client.ts`
  - `callAria2Rpc(rpcUrl, method, params, secret?)`：
    - 通用 JSON-RPC 调用封装，自动处理 `token:<secret>`。
  - `testConnection(aria2Config)`：
    - 调用 `aria2.getVersion` 检测连接状态。
  - `addDownload(downloadUrl, aria2Config, filename?)`：
    - 设置默认下载参数（多连接、分片）。
    - 合并用户自定义 `aria2Config.options`。
    - 调用 `aria2.addUri` 并返回 GID。

## 8. 扩展与开发建议

### 8.1 新增命令

1. 在 `src/bot/commands` 下创建新命令文件并导出处理函数。
2. 在 `src/bot/commands/index.ts` 中导出该命令。
3. 在 `src/bot/bot.ts` 的 `createBot` 中使用 `bot.command('<name>', handler)` 注册命令。
4. 如需展示在客户端菜单中，在 `startBot` 的 `setMyCommands` 中追加。

### 8.2 新增平台解析

1. 在 `linkDetector.ts` 中为新平台追加匹配正则，更新 `Platform` 类型。
2. 在 `videoParser` 或新建对应 service 中实现解析逻辑。
3. 在 `messageHandler.processMediaUrl` 中增加平台分支和调用逻辑。

### 8.3 调试建议

- 使用 `npm run dev` 进行开发，方便查看实时日志。
- 在本地先使用命令行直接运行 `yt-dlp` 和 Aria2 JSON-RPC，确认网络与权限正常。
- 如需更多日志信息，可根据需要增加日志输出或调整 `LOG_LEVEL`。

