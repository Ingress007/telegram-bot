import type { Aria2Config, DownloadResult } from '../types/index.js';

interface Aria2RpcResponse {
  id: string;
  jsonrpc: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

async function callAria2Rpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
  secret?: string
): Promise<unknown> {
  const rpcPayload = {
    jsonrpc: '2.0',
    method,
    id: Date.now().toString(),
    params: secret ? [`token:${secret}`, ...params] : params,
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rpcPayload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json() as Aria2RpcResponse;

  if (result.error) {
    throw new Error(`Aria2 RPC Error: ${result.error.message}`);
  }

  return result.result;
}

export async function testConnection(
  aria2Config: Aria2Config
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const result = await callAria2Rpc(
      aria2Config.rpcUrl,
      'aria2.getVersion',
      [],
      aria2Config.secret
    ) as { version: string };

    return {
      success: true,
      version: result.version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败';
    return {
      success: false,
      error: message,
    };
  }
}

export async function addDownload(
  downloadUrl: string,
  aria2Config: Aria2Config,
  filename?: string
): Promise<DownloadResult> {
  try {
    const options: Record<string, string | number | boolean> = {
      'max-connection-per-server': 16,
      'split': 16,
      'min-split-size': '1M',
    };

    if (aria2Config.dir) {
      options.dir = aria2Config.dir;
    }

    if (filename) {
      options.out = filename;
    }

    if (aria2Config.options) {
      for (const [key, value] of Object.entries(aria2Config.options)) {
        if (value !== undefined) {
          options[key] = value;
        }
      }
    }

    console.log(`[Aria2] Adding download: ${downloadUrl}`);
    console.log(`[Aria2] Options:`, options);

    const gid = await callAria2Rpc(
      aria2Config.rpcUrl,
      'aria2.addUri',
      [[downloadUrl], options],
      aria2Config.secret
    ) as string;

    console.log(`[Aria2] Task added, GID: ${gid}`);

    return {
      success: true,
      gid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '添加下载失败';
    console.error(`[Aria2] Error:`, message);
    return {
      success: false,
      error: message,
    };
  }
}
