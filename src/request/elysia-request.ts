import type { Context } from 'elysia';

/**
 * Express/Fastify-style request wrapper around Elysia's `Context`.
 *
 * Exposes the parsed body/query/params/headers Nest expects, plus
 * Express conveniences like `.get(name)`, `.originalUrl`, `.hostname`,
 * and an escape hatch (`.elysia`) for users that want the full Context.
 */
export class ElysiaRequest {
  public readonly elysia: Context;
  public readonly raw: Request;
  private _parsedUrl?: URL;

  constructor(ctx: Context) {
    this.elysia = ctx;
    this.raw = ctx.request;
  }

  private get parsedUrl(): URL {
    if (!this._parsedUrl) this._parsedUrl = new URL(this.raw.url);
    return this._parsedUrl;
  }

  public get body(): unknown {
    return this.elysia.body;
  }

  public get query(): Record<string, unknown> {
    return this.elysia.query as Record<string, unknown>;
  }

  public get params(): Record<string, string> {
    return (this.elysia.params ?? {}) as Record<string, string>;
  }

  public get headers(): Record<string, string | undefined> {
    return this.elysia.headers as Record<string, string | undefined>;
  }

  public get method(): string {
    return this.raw.method;
  }

  public get url(): string {
    return this.parsedUrl.pathname + this.parsedUrl.search;
  }

  public get originalUrl(): string {
    return this.url;
  }

  public get path(): string {
    return this.elysia.path;
  }

  public get route(): string {
    return this.elysia.route;
  }

  public get hostname(): string {
    return this.parsedUrl.hostname;
  }

  public get protocol(): string {
    return this.parsedUrl.protocol.replace(':', '');
  }

  public get ip(): string | undefined {
    const server = this.elysia.server;
    if (!server) return undefined;
    try {
      return server.requestIP(this.raw)?.address;
    } catch {
      return undefined;
    }
  }

  public get cookies(): Record<string, unknown> {
    return this.elysia.cookie as unknown as Record<string, unknown>;
  }

  public get(name: string): string | undefined {
    const value = this.headers[name.toLowerCase()];
    return value;
  }

  public header(name: string): string | undefined {
    return this.get(name);
  }
}
