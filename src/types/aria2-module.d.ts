declare module 'aria2' {
  interface Aria2Options {
    host?: string;
    port?: number;
    secure?: boolean;
    secret?: string;
    path?: string;
  }

  interface VersionResult {
    version: string;
    enabledFeatures: string[];
  }

  class Aria2 {
    constructor(options?: Aria2Options);
    open(): Promise<void>;
    close(): Promise<void>;
    call(method: string, ...params: unknown[]): Promise<unknown>;
  }

  export default Aria2;
}
