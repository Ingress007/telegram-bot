import YTDlpWrap from 'yt-dlp-wrap';
import type { VideoInfo, ParseResult, VideoFormat } from '../types/index.js';
import { config, cookiesFile } from '../config/env.js';
import { detectPlatform } from './linkDetector.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YTDlpWrapClass = (YTDlpWrap as any).default || YTDlpWrap;
const ytDlp = new YTDlpWrapClass(config.ytdlpPath);

// Build extra arguments for yt-dlp 
// 为yt-dlp构建额外参数
function getYtdlpArgs(): string[] {
  const args: string[] = [];
  if (cookiesFile) {
    args.push('--cookies', cookiesFile);
  }
  return args;
}

interface YtDlpOutput {
  title?: string;
  webpage_url?: string;
  url?: string;
  thumbnail?: string;
  duration?: number;
  resolution?: string;
  width?: number;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  formats?: Array<{
    format_id?: string;
    ext?: string;
    quality?: string | number;
    resolution?: string;
    filesize?: number;
    filesize_approx?: number;
    url?: string;
    protocol?: string;
    vcodec?: string;
    width?: number;
    height?: number;
  }>;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function parseVideo(url: string): Promise<ParseResult> {
  const platform = detectPlatform(url);
  
  if (platform === 'unknown') {
    return {
      success: false,
      error: '不支持的平台链接',
    };
  }

  try {
    const extraArgs = getYtdlpArgs();
    const output = await Promise.race([
      ytDlp.getVideoInfo(url, extraArgs) as Promise<YtDlpOutput>,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('解析超时')), config.parseTimeout)
      ),
    ]);

    // Prefer direct MP4 downloads (protocol: https) over HLS streams (m3u8) 
    // 优先选择直接MP4下载（协议：https）而不是HLS流（m3u8）
    const mp4Formats = (output.formats || [])
      .filter(f => f.url && f.ext === 'mp4' && f.protocol === 'https' && f.vcodec !== 'none')
      .sort((a, b) => (b.width || 0) - (a.width || 0));

    const formats: VideoFormat[] = mp4Formats.slice(0, 5).map(f => ({
      formatId: f.format_id || 'unknown',
      ext: f.ext || 'mp4',
      quality: String(f.quality || f.resolution || 'unknown'),
      resolution: f.resolution || (f.width && f.height ? `${f.width}x${f.height}` : undefined),
      fileSize: f.filesize || f.filesize_approx,
      url: f.url,
    }));

    // Use top-level url first (best format), then fallback to mp4 formats 
    // 优先使用顶层URL（最佳格式），然后回退到MP4格式
    const directUrl = output.url || mp4Formats[0]?.url || '';
    const resolution = output.resolution || 
      (output.width && output.height ? `${output.width}x${output.height}` : undefined) ||
      mp4Formats[0]?.resolution ||
      (mp4Formats[0]?.width && mp4Formats[0]?.height ? `${mp4Formats[0].width}x${mp4Formats[0].height}` : undefined);

    const video: VideoInfo = {
      platform,
      title: output.title || '未知标题',
      url,
      directUrl,
      thumbnail: output.thumbnail,
      duration: output.duration,
      resolution,
      fileSize: output.filesize || output.filesize_approx || mp4Formats[0]?.filesize_approx,
      formats,
    };

    return {
      success: true,
      video,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    return {
      success: false,
      error: message.includes('超时') ? '解析超时，请稍后重试' : `解析失败: ${message}`,
    };
  }
}

export function formatVideoInfo(video: VideoInfo): string {
  const lines: string[] = [];
  
  lines.push(`🎬 视频信息\n`);
  lines.push(`📝 标题: ${video.title}`);
  
  if (video.duration) {
    lines.push(`⏱ 时长: ${formatDuration(video.duration)}`);
  }
  
  if (video.resolution) {
    lines.push(`📊 分辨率: ${video.resolution}`);
  }
  
  if (video.fileSize) {
    lines.push(`💾 大小: ${formatFileSize(video.fileSize)}`);
  }

  return lines.join('\n');
}

export { formatDuration, formatFileSize };
