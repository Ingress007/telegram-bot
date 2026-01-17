export type Platform = 'twitter' | 'facebook' | 'tiktok' | 'instagram' | 'youtube' | 'telegram' | 'unknown';

export type MediaType = 'video' | 'videos' | 'image' | 'images' | 'mixed';

export interface VideoFormat {
  formatId: string;
  ext: string;
  quality: string;
  resolution?: string;
  fileSize?: number;
  url?: string;
}

export interface VideoInfo {
  platform: Platform;
  title: string;
  url: string;
  directUrl: string;
  thumbnail?: string;
  duration?: number;
  resolution?: string;
  fileSize?: number;
  formats?: VideoFormat[];
}

export interface ImageInfo {
  platform: Platform;
  title: string;
  url: string;
  imageUrl: string;
  thumbnail?: string;
  resolution?: string;
}

export interface MediaInfo {
  type: MediaType;
  platform: Platform;
  title: string;
  url: string;
  directUrl: string;  // video URL or first image URL // 视频URL或第一张图片URL
  imageUrls?: string[];  // all image URLs for multi-image posts // 多图帖子的所有图片URL
  videoUrls?: string[];  // all video URLs for multi-video posts // 多视频帖子的所有视频URL
  thumbnails?: string[]; // all video thumbnails for multi-video posts // 多视频帖子的所有视频缩略图
  thumbnail?: string;
  duration?: number;
  resolution?: string;
  fileSize?: number;
  formats?: VideoFormat[];
}

export interface ParseResult {
  success: boolean;
  video?: VideoInfo;
  media?: MediaInfo;
  error?: string;
}
