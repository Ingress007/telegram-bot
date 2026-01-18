# Telegram Video Bot 项目介绍

## 简介

Telegram Video Bot 是一个面向聊天场景的视频/图片解析与下载机器人。  
用户在与机器人对话时发送平台链接（目前重点支持 X / Twitter 帖子），Bot 会自动：

- 识别链接所属平台
- 调用解析服务获取视频/图片的直链和元信息
- 在 Telegram 中展示解析结果
- 可一键将媒体发送到 Aria2 进行下载

项目采用 TypeScript + Node.js + Telegraf 编写，支持通过环境变量灵活配置运行环境、代理和解析行为。

## 当前版本状态（v1.0）

- 项目 1.0 基本功能已完成
- 已在实际环境中对 **X（Twitter）平台帖子** 进行测试：
  - 解析单条推文中的视频/图片正常
  - 通过按钮将媒体任务发送到 Aria2 下载正常
- 其他平台（Instagram、YouTube、Facebook、TikTok）解析逻辑已实现，行为依赖 `yt-dlp` 以及目标站点当前策略，推荐在实际部署前逐一验证。

## 核心特性

- 支持平台链接识别：
  - X / Twitter
  - Instagram
  - YouTube
  - Facebook
  - TikTok
- 媒体解析：
  - 使用 `yt-dlp` 解析视频信息（标题、时长、分辨率、大小等）
  - 对 Twitter / Instagram 支持图片解析（含多图）
  - 对 Twitter 额外集成 vxtwitter API，提升推文视频/图片解析能力
- Aria2 集成：
  - 支持通过多轮对话完成 Aria2 RPC 配置
  - 支持单个媒体发送到 Aria2
  - 支持多图/多视频批量发送下载任务
- Telegram 交互：
  - 自定义命令菜单（/start、/help、/set_aria2 等）
  - 内联按钮：在线播放、查看原图、发送到 Aria2、批量下载
  - 基本错误提示与异常兜底

## 技术栈

- Node.js (ESM, >= 18)
- TypeScript
- [Telegraf](https://telegraf.js.org/)：Telegram Bot 框架
- [yt-dlp-wrap](https://github.com/ghostrider-05/yt-dlp-wrap)：Node 调用 `yt-dlp`
- Aria2 JSON-RPC：下载任务管理
- 其他：
  - `zod` 用于配置输入校验
  - `https-proxy-agent` / `socks-proxy-agent` 用于代理支持

## 目录结构（简要）

```text
.
├─ src
│  ├─ bot
│  │  ├─ commands      # Telegram 命令处理（/start /help /set_aria2 等）
│  │  ├─ handlers      # 文本消息与回调处理
│  │  └─ bot.ts        # Bot 创建与启动逻辑
│  ├─ config           # 环境变量与全局配置
│  ├─ services         # 解析服务、Aria2 客户端、用户配置等
│  ├─ types            # TypeScript 类型定义
│  └─ index.ts         # 应用入口
├─ data
│  └─ users.json       # 用户配置数据库（运行时生成）
├─ DEVELOPMENT.md      # 开发文档（面向开发者）
├─ package.json
├─ tsconfig.json
└─ .env / .env.example # 环境变量配置
```

## 快速开始（运行说明）

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置环境变量：

   - **开发环境**：配置 `.env.dev` 文件
   - **生产环境**：配置 `.env.prod` 文件

   常用配置项：
   - `BOT_TOKEN`：Telegram Bot Token（必填）
   - `DATA_DIR`：用户数据目录（可选，默认 `./data`）
   - `LOG_LEVEL`：日志级别（开发用 `info`，生产用 `warn`）
   - `YTDLP_PATH`：`yt-dlp` 可执行文件路径（建议显式配置）
   - `PARSE_TIMEOUT`：解析超时时间，默认 `60000` 毫秒
   - `HTTPS_PROXY` / `HTTP_PROXY` / `PROXY_URL`：可选代理
   - `YTDLP_COOKIES`：可选 cookies 文件，适用于需要登录的视频站点

3. 环境切换运行：

   ```bash
   # 开发环境运行（Linux/Mac）
   npm run dev
   
   # 开发环境运行（Windows）
   npm run dev:win
   ```

4. 构建与生产运行：

   ```bash
   # 构建项目
   npm run build
   
   # 生产环境运行（Linux/Mac）
   npm run prod
   
   # 生产环境运行（Windows）
   npm run prod:win
   ```

## 基本使用流程（以 X / Twitter 为例）

1. 在 Telegram 中添加并启动 Bot，发送 `/start` 获取欢迎信息。
2. 可选：使用 `/set_aria2` 按提示配置 Aria2 RPC 地址、密钥和下载目录。
3. 将 Twitter 推文链接发送给 Bot：
   - Bot 会识别链接并显示“正在解析”提示。
   - 解析成功后，Bot 返回媒体信息（标题、时长、分辨率/数量等）。
   - 消息下方会出现：
     - 在线播放 / 查看原图按钮
     - “发送到 Aria2”按钮（或多媒体时的“下载全部”按钮）
4. 点击对应按钮即可触发 Aria2 下载任务。

## 后续规划方向（可选）

根据当前 v1.0 的实现，后续可以考虑：

- 针对 Instagram / YouTube / Facebook / TikTok 等平台进行更全面的兼容性测试与优化。
- 为 Aria2 下载任务提供简单的查询/管理能力（查看进度、取消任务等）。
- 增加多语言支持（目前文案主要为中文）。
- 引入更完善的日志和监控（按 `LOG_LEVEL` 控制输出）。

如需了解内部实现细节，可参考根目录下的 `DEVELOPMENT.md` 开发文档。  
该文档对模块划分、接口设计和扩展方式有更深入的说明。

