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
  directUrl: string;  // video URL or first image URL
  imageUrls?: string[];  // all image URLs for multi-image posts
  videoUrls?: string[];  // all video URLs for multi-video posts
  thumbnails?: string[]; // all video thumbnails for multi-video posts
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
