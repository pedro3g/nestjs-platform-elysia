import {
  type INestApplicationContext,
  Logger,
  type WebSocketAdapter,
  type WsMessageHandler,
} from '@nestjs/common';
import { from, isObservable, lastValueFrom, type Observable } from 'rxjs';
import type { NestElysiaApplication } from '../interfaces/nest-elysia-application.interface';

export interface ElysiaWsAdapterOptions {
  path?: string;
  namespace?: string;
}

const DEFAULT_WS_MAX_MESSAGE_BYTES = 1 * 1024 * 1024;
const DEFAULT_WS_MAX_JSON_DEPTH = 32;
const DEFAULT_WS_MAX_JSON_KEYS = 1024;

export type ErrorMessageSanitizer = (err: unknown) => string;

export interface ElysiaWsAdapterConfig {
  /**
   * Maximum size (in bytes) of a single inbound WebSocket message. Messages
   * above the limit are dropped and a generic error envelope is sent back
   * to the client. Defaults to 1 MiB. Set to 0 to disable the check.
   *
   * Forwarded to Bun's WebSocket layer as `maxPayloadLength` so oversized
   * frames are rejected at the protocol level before they reach the handler.
   */
  maxMessageSize?: number;
  /**
   * Controls leakage of handler error details to clients.
   *
   * - `false` (default): clients receive a generic `"Internal error"` envelope.
   * - `true`: the raw `err.message` is forwarded — only safe when every handler
   *   error is intentionally user-facing.
   * - `(err) => string`: custom sanitizer that decides per-error what to expose.
   */
  exposeErrorMessages?: boolean | ErrorMessageSanitizer;
  /**
   * Maximum JSON nesting depth allowed for inbound text frames. Payloads
   * deeper than this are dropped with `"Payload too complex"` before
   * `JSON.parse` is called. Defaults to 32.
   */
  maxJsonDepth?: number;
  /**
   * Maximum total number of keys allowed across a JSON payload. Defaults to 1024.
   */
  maxJsonKeys?: number;
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
  private exceptionSanitizer: ErrorMessageSanitizer | false = false;

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

  /**
   * Compatibility shim so NestJS's default `BaseWsExceptionFilter` can call
   * `client.emit('exception', payload)`. The adapter routes the payload through
   * the configured sanitizer and forwards it as a standard `{event:'error'}`
   * envelope.
   */
  emit(event: string, payload: unknown): this {
    if (event === 'exception') {
      const message = this.sanitizeException(payload);
      this.send({ event: 'error', data: { message } });
      return this;
    }
    this.send({ event, data: payload });
    return this;
  }

  /** @internal */
  setExceptionSanitizer(sanitizer: ErrorMessageSanitizer | false): void {
    this.exceptionSanitizer = sanitizer;
  }

  private sanitizeException(payload: unknown): string {
    if (this.exceptionSanitizer !== false) {
      return this.exceptionSanitizer(payload);
    }
    return 'Internal error';
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
  protected readonly logger = new Logger(ElysiaWsAdapter.name);
  private readonly maxMessageSize: number;
  private readonly exposeErrorMessages: ErrorMessageSanitizer | false;
  private readonly maxJsonDepth: number;
  private readonly maxJsonKeys: number;
  private readonly servers: Array<{
    server: ElysiaWsServer;
    clients: Map<string, ElysiaWsClient>;
  }> = [];

  constructor(
    private readonly app: NestElysiaApplication | INestApplicationContext,
    config: ElysiaWsAdapterConfig = {},
  ) {
    this.maxMessageSize =
      typeof config.maxMessageSize === 'number' && Number.isFinite(config.maxMessageSize)
        ? Math.max(0, Math.floor(config.maxMessageSize))
        : DEFAULT_WS_MAX_MESSAGE_BYTES;
    this.exposeErrorMessages =
      config.exposeErrorMessages === true
        ? extractMessage
        : typeof config.exposeErrorMessages === 'function'
          ? config.exposeErrorMessages
          : false;
    this.maxJsonDepth =
      typeof config.maxJsonDepth === 'number' && config.maxJsonDepth > 0
        ? Math.floor(config.maxJsonDepth)
        : DEFAULT_WS_MAX_JSON_DEPTH;
    this.maxJsonKeys =
      typeof config.maxJsonKeys === 'number' && config.maxJsonKeys > 0
        ? Math.floor(config.maxJsonKeys)
        : DEFAULT_WS_MAX_JSON_KEYS;
  }

  create(_port: number, options: ElysiaWsAdapterOptions = {}): ElysiaWsServer {
    const path = this.normalizePath(options.path ?? options.namespace ?? '/');
    const server: ElysiaWsServer = { path, onConnection: null };
    const clients = new Map<string, ElysiaWsClient>();
    this.servers.push({ server, clients });

    const elysia = this.getElysiaInstance();

    const wsHandlers: Record<string, unknown> = {
      open: (ws: RawElysiaWs) => {
        if (!ws.id) return;
        const client = new ElysiaWsClient(ws);
        client.setExceptionSanitizer(this.exposeErrorMessages);
        clients.set(ws.id, client);
        server.onConnection?.(client);
      },
      message: (ws: RawElysiaWs, message: unknown) => {
        const client = ws.id ? clients.get(ws.id) : undefined;
        if (!client) return;
        client.updateRaw(ws);
        client.dispatchMessage(message);
      },
      close: (ws: RawElysiaWs) => {
        const client = ws.id ? clients.get(ws.id) : undefined;
        if (!client) return;
        client.dispatchClose();
        clients.delete(ws.id!);
      },
    };
    if (this.maxMessageSize > 0) wsHandlers.maxPayloadLength = this.maxMessageSize;

    elysia.ws(path, wsHandlers as Parameters<typeof elysia.ws>[1]);

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
    const handlersByEvent = new Map<string, WsMessageHandler<string>>();
    for (const h of handlers) handlersByEvent.set(h.message, h);

    client.on('message', async (raw) => {
      try {
        // Elysia auto-parses valid JSON before invoking the message callback,
        // so `raw` may already be an object. Estimate the inbound size and
        // shape from the string form when it isn't a primitive string.
        const probe: string | unknown =
          typeof raw === 'string'
            ? raw
            : raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)
              ? raw
              : safeStringify(raw);
        if (this.maxMessageSize > 0 && this.exceedsLimit(probe)) {
          this.logger.warn(
            `WS message dropped: exceeded maxMessageSize (${this.maxMessageSize} bytes)`,
          );
          client.send(JSON.stringify({ event: 'error', data: { message: 'Message too large' } }));
          return;
        }

        if (typeof probe === 'string') {
          const guard = this.guardJsonShape(probe);
          if (!guard.ok) {
            this.logger.warn(`WS message dropped: ${guard.reason}`);
            client.send(
              JSON.stringify({ event: 'error', data: { message: 'Payload too complex' } }),
            );
            return;
          }
        }

        const parsed: unknown = typeof raw === 'string' ? this.parseJson(raw) : raw;

        const envelope = parsed as { event?: unknown; data?: unknown };
        const event = typeof envelope?.event === 'string' ? envelope.event : undefined;
        if (!event) return;

        const handler = handlersByEvent.get(event);
        if (!handler) return;

        const handlerResult = await handler.callback(envelope.data);
        if (handlerResult === undefined) return;

        const stream$ = isObservable(handlerResult)
          ? handlerResult
          : from(Promise.resolve(handlerResult));
        const value = await lastValueFrom(transform(stream$));
        client.send(JSON.stringify(asEnvelope(value, event)));
      } catch (err) {
        this.logger.error('WS handler raised', err instanceof Error ? err.stack : err);
        const message =
          this.exposeErrorMessages !== false ? this.exposeErrorMessages(err) : 'Internal error';
        try {
          client.send(JSON.stringify({ event: 'error', data: { message } }));
        } catch {
          /* connection may already be closed */
        }
      }
    });
  }

  close(server: ElysiaWsServer): void {
    const idx = this.servers.findIndex((s) => s.server === server);
    if (idx === -1) return;
    const [entry] = this.servers.splice(idx, 1);
    if (!entry) return;
    entry.clients.clear();
    server.onConnection = null;
  }

  async dispose(): Promise<void> {
    for (const entry of this.servers) {
      entry.clients.clear();
      entry.server.onConnection = null;
    }
    this.servers.length = 0;
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
      if (raw.length > this.maxMessageSize) return true;
      if (raw.length * 4 <= this.maxMessageSize) return false;
      return Buffer.byteLength(raw, 'utf-8') > this.maxMessageSize;
    }
    if (raw instanceof ArrayBuffer) return raw.byteLength > this.maxMessageSize;
    if (ArrayBuffer.isView(raw)) return raw.byteLength > this.maxMessageSize;
    return false;
  }

  private guardJsonShape(raw: string): { ok: true } | { ok: false; reason: string } {
    let depth = 0;
    let maxDepth = 0;
    let keys = 0;
    let inString = false;
    let inEscape = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      if (inEscape) {
        inEscape = false;
        continue;
      }
      if (inString) {
        if (ch === 0x5c) inEscape = true;
        else if (ch === 0x22) inString = false;
        continue;
      }
      if (ch === 0x22) {
        inString = true;
      } else if (ch === 0x7b || ch === 0x5b) {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        if (maxDepth > this.maxJsonDepth)
          return { ok: false, reason: `JSON depth > ${this.maxJsonDepth}` };
      } else if (ch === 0x7d || ch === 0x5d) {
        depth--;
      } else if (ch === 0x3a) {
        keys++;
        if (keys > this.maxJsonKeys)
          return { ok: false, reason: `JSON keys > ${this.maxJsonKeys}` };
      }
    }
    return { ok: true };
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: unknown };
    if (typeof e.message === 'string') return e.message;
  }
  if (typeof err === 'string') return err;
  return String(err);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
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
