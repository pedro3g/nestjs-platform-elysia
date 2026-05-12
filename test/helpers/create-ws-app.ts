import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ElysiaAdapter,
  ElysiaWsAdapter,
  type ElysiaWsAdapterConfig,
  type NestElysiaApplication,
} from '../../src';

export interface CreateWsAppOptions {
  modules: Type<unknown>[];
  wsConfig?: ElysiaWsAdapterConfig;
}

export async function createWsApp(options: CreateWsAppOptions): Promise<{
  app: NestElysiaApplication;
  port: number;
  url: (path: string) => string;
}> {
  const app = await NestFactory.create<NestElysiaApplication>(
    options.modules[0]!,
    new ElysiaAdapter(),
    { logger: false },
  );
  app.useWebSocketAdapter(new ElysiaWsAdapter(app, options.wsConfig));
  try {
    await app.listen(0, '127.0.0.1');
  } catch (err) {
    await app.close().catch(() => undefined);
    throw err;
  }
  const port = (app.getHttpAdapter().getInstance() as { server?: { port: number } }).server?.port;
  if (!port) {
    await app.close().catch(() => undefined);
    throw new Error('failed to bind WebSocket port');
  }
  return {
    app,
    port,
    url: (path: string) => `ws://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}`,
  };
}

export function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', (e) => reject(e), { once: true });
  });
}

export function listenForMessage(ws: WebSocket, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.onmessage = null;
      reject(new Error('ws message timeout'));
    }, timeoutMs);
    ws.onmessage = (e) => {
      clearTimeout(timer);
      ws.onmessage = null;
      resolve(
        typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer),
      );
    };
  });
}
