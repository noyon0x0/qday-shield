declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string | number): this;
    end(body?: string): void;
  }
  export interface AddressInfo { port: number; address: string; family: string; }
  export interface Server {
    headersTimeout: number;
    requestTimeout: number;
    keepAliveTimeout: number;
    maxHeadersCount: number | null;
    listen(port: number, host: string, callback?: () => void): this;
    close(callback?: (error?: Error) => void): this;
    address(): AddressInfo | string | null;
  }
  export function createServer(listener: (request: IncomingMessage, response: ServerResponse) => void): Server;
}

declare module "node:fs/promises" {
  export interface FileHandle {
    writeFile(data: string, options?: { encoding?: string }): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }
  export function mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
  export function chmod(path: string, mode: number): Promise<void>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function open(path: string, flags: string, mode?: number): Promise<FileHandle>;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
  export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  exitCode?: number;
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
};
