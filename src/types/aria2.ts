export interface Aria2Config {
  rpcUrl: string;
  secret?: string;
  dir?: string;
  options?: Aria2Options;
}

export interface Aria2Options {
  'max-connection-per-server'?: number;
  split?: number;
  'user-agent'?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface DownloadResult {
  success: boolean;
  gid?: string;
  error?: string;
}
