import type { INestApplicationContext, WebSocketAdapter, WsMessageHandler } from '@nestjs/common';
import { from, isObservable, lastValueFrom, type Observable } from 'rxjs';
import type { NestElysiaApplication } from '../interfaces/nest-elysia-application.interface';

export interface ElysiaWsAdapterOptions {
  path?: string;
  namespace?: string;
}

const DEFAULT_WS_MAX_MESSAGE_BYTES = 1 * 1024 * 1024;

export interface ElysiaWsAdapterConfig {
  /**
   * Maximum size (in bytes) of a single inbound WebSocket message. Messages
   * above the limit are dropped and a generic error envelope is sent back
   * to the client. Defaults to 1 MiB. Set to 0 to disable the check.
   */
  maxMessageSize?: number;
  /**
   * When true, error messages thrown by handlers are forwarded verbatim to
   * the client. Defaults to false — clients receive a generic "Internal
   * error" so handler exceptions do not leak server internals.
   */
  exposeErrorMessages?: boolean;
}

interface RawElysiaWs {
  send: (data: unknown) => unknown;
  close: (code?: number, reason?: string) => unknown;
  id: string;
  raw?: BunServerWebSocket;
}

interface BunServerWebSocket {
  send: (data: string | Uint8Array) => number;
  close: (code?: number, reason?: string) => void;
  readyState: number;
}

interface ElysiaWsRouteApi {
  ws: (
    path: string,
    handlers: {
      open?: (ws: RawElysiaWs) => unknown;
      message?: (ws: RawElysiaWs, message: unknown) => unknown;
      close?: (ws: RawElysiaWs) => unknown;
    },
  ) => unknown;
}

export class ElysiaWsClient {
  private readonly messageListeners: Array<(raw: unknown) => void> = [];
  private readonly closeListeners: Array<() => void> = [];
  private readonly stableRaw: BunServerWebSocket | undefined;
  private currentWrapper: RawElysiaWs;

  constructor(raw: RawElysiaWs) {
    this.currentWrapper = raw;
    this.stableRaw = raw.raw;
  }

  get raw(): RawElysiaWs {
    return this.currentWrapper;
  }

  updateRaw(raw: RawElysiaWs): void {
    this.currentWrapper = raw;
  }

  send(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.stableRaw) this.stableRaw.send(payload);
    else this.currentWrapper.send(payload);
  }

  close(code?: number, reason?: string): void {
    if (this.stableRaw) this.stableRaw.close(code, reason);
    else this.currentWrapper.close(code, reason);
  }

  on(event: 'message' | 'close', listener: (data?: unknown) => void): this {
    if (event === 'message') this.messageListeners.push(listener);
    else if (event === 'close') this.closeListeners.push(listener as () => void);
    return this;
  }

  dispatchMessage(raw: unknown): void {
    for (const listener of this.messageListeners) listener(raw);
  }

  dispatchClose(): void {
    for (const listener of this.closeListeners) listener();
  }
}

export interface ElysiaWsServer {
  path: string;
  onConnection: ((client: ElysiaWsClient) => void) | null;
}

export class ElysiaWsAdapter implements WebSocketAdapter<ElysiaWsServer, ElysiaWsClient> {
  private readonly maxMessageSize: number;
  private readonly exposeErrorMessages: boolean;

  constructor(
    private readonly app: NestElysiaApplication | INestApplicationContext,
    config: ElysiaWsAdapterConfig = {},
  ) {
    this.maxMessageSize =
      typeof config.maxMessageSize === 'number' && Number.isFinite(config.maxMessageSize)
        ? Math.max(0, Math.floor(config.maxMessageSize))
        : DEFAULT_WS_MAX_MESSAGE_BYTES;
    this.exposeErrorMessages = config.exposeErrorMessages === true;
  }

  create(_port: number, options: ElysiaWsAdapterOptions = {}): ElysiaWsServer {
    const path = this.normalizePath(options.path ?? options.namespace ?? '/');
    const server: ElysiaWsServer = { path, onConnection: null };
    const clients = new Map<string, ElysiaWsClient>();

    const elysia = this.getElysiaInstance();

    elysia.ws(path, {
      open: (ws) => {
        if (!ws.id) return;
        const client = new ElysiaWsClient(ws);
        clients.set(ws.id, client);
        server.onConnection?.(client);
      },
      message: (ws, message) => {
        const client = ws.id ? clients.get(ws.id) : undefined;
        if (!client) return;
        client.updateRaw(ws);
        client.dispatchMessage(message);
      },
      close: (ws) => {
        const client = ws.id ? clients.get(ws.id) : undefined;
        if (!client) return;
        client.dispatchClose();
        clients.delete(ws.id!);
      },
    });

    return server;
  }

  bindClientConnect(server: ElysiaWsServer, callback: (client: ElysiaWsClient) => void): void {
    server.onConnection = callback;
  }

  bindClientDisconnect(client: ElysiaWsClient, callback: () => void): void {
    client.on('close', callback);
  }

  bindMessageHandlers(
    client: ElysiaWsClient,
    handlers: WsMessageHandler<string>[],
    transform: (data: unknown) => Observable<unknown>,
  ): void {
    const handlersByEvent = new Map<string, WsMessageHandler<string>>(
      handlers.map((h) => [h.message, h]),
    );

    client.on('message', async (raw) => {
      if (this.maxMessageSize > 0 && this.exceedsLimit(raw)) {
        client.send(JSON.stringify({ event: 'error', data: { message: 'Message too large' } }));
        return;
      }
      const parsed = typeof raw === 'string' ? this.parseJson(raw) : raw;
      const envelope = parsed as { event?: unknown; data?: unknown };
      const event = typeof envelope?.event === 'string' ? envelope.event : undefined;
      if (!event) return;

      const handler = handlersByEvent.get(event);
      if (!handler) return;

      const payload = envelope.data;
      const handlerResult = await handler.callback(payload);
      if (handlerResult === undefined) return;

      const stream$ = isObservable(handlerResult)
        ? handlerResult
        : from(Promise.resolve(handlerResult));

      try {
        const value = await lastValueFrom(transform(stream$));
        client.send(JSON.stringify(asEnvelope(value, event)));
      } catch (err) {
        const message = this.exposeErrorMessages ? (err as Error).message : 'Internal error';
        client.send(JSON.stringify({ event: 'error', data: { message } }));
      }
    });
  }

  close(_server: ElysiaWsServer): void {
    // Elysia owns the underlying Bun.Server lifecycle; closing the WS route
    // alongside the HTTP server happens when the user calls app.close().
  }

  async dispose(): Promise<void> {
    // No standalone resources to release: WS routes live on the same Bun server
    // that the HTTP adapter shuts down via app.close().
  }

  private getElysiaInstance(): ElysiaWsRouteApi {
    const adapter = (this.app as NestElysiaApplication).getHttpAdapter();
    return adapter.getInstance() as ElysiaWsRouteApi;
  }

  private normalizePath(path: string): string {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private exceedsLimit(raw: unknown): boolean {
    if (typeof raw === 'string') {
      // UTF-8 bytes <= 4 * code units; cheap upper bound that avoids encoding.
      return raw.length * 4 > this.maxMessageSize;
    }
    if (raw instanceof ArrayBuffer) {
      return raw.byteLength > this.maxMessageSize;
    }
    if (ArrayBuffer.isView(raw)) {
      return raw.byteLength > this.maxMessageSize;
    }
    return false;
  }
}

function asEnvelope(value: unknown, defaultEvent: string): { event: string; data: unknown } {
  if (
    value !== null &&
    typeof value === 'object' &&
    'event' in value &&
    typeof (value as { event: unknown }).event === 'string'
  ) {
    const envelope = value as { event: string; data?: unknown };
    return { event: envelope.event, data: envelope.data };
  }
  return { event: defaultEvent, data: value };
}
