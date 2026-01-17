import type { Telegram } from 'telegraf';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB - Telegram Bot API limit // 20MB - Telegram机器人API限制

export interface FileInfo {
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface FileDownloadResult {
  success: boolean;
  url?: string;
  filePath?: string;
  error?: string;
}

/**
 * 获取Telegram文件下载URL
 * Get file download URL from Telegram
 */
export async function getFileDownloadUrl(
  telegram: Telegram,
  fileId: string,
  botToken: string
): Promise<FileDownloadResult> {
  try {
    const file = await telegram.getFile(fileId);
    
    if (!file.file_path) {
      return { success: false, error: 'File path not available' };
    }
    
    const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
    
    return {
      success: true,
      url,
      filePath: file.file_path,
    };
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      error: error.message || 'Failed to get file',
    };
  }
}

/**
 * 检查文件大小是否在Telegram Bot API限制范围内
 * Check if file size is within Telegram Bot API limit
 */
export function isFileSizeValid(fileSize?: number): boolean {
  if (fileSize === undefined) return true; // Assume valid if unknown // 如果未知则假设有效
  return fileSize <= MAX_FILE_SIZE;
}

/**
 * 格式化文件大小用于显示
 * Format file size for display
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return 'Unknown';
  
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 从MIME类型获取文件扩展名
 * Get file extension from MIME type
 */
export function getExtensionFromMime(mimeType?: string): string {
  if (!mimeType) return 'bin';
  
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'text/plain': 'txt',
    'application/json': 'json',
  };
  
  return mimeToExt[mimeType] || mimeType.split('/')[1] || 'bin';
}

/**
 * 生成安全的文件名
 * Generate safe filename
 */
export function generateFileName(
  baseName: string,
  extension: string,
  uniqueId: string
): string {
  // Remove illegal characters 
  // 移除非法字符
  const safeName = baseName
    .replace(/[<>:"/\\|?*]/g, '_')
    .substring(0, 100);
  
  return `${safeName}_${uniqueId}.${extension}`;
}

export const MAX_TELEGRAM_FILE_SIZE = MAX_FILE_SIZE;
