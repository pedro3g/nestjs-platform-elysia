import type { Context } from 'elysia';
import type { TrustProxyResolver } from '../interfaces/elysia-adapter-options.interface';

export interface ElysiaRequestOptions {
  trustProxy?: TrustProxyResolver;
}

export class ElysiaRequest {
  public readonly elysia: Context;
  public readonly raw: Request;
  private readonly options: ElysiaRequestOptions;
  private _parsedUrl?: URL;
  private _forwardedFor?: string[];
  private _directIp?: string | null;

  constructor(ctx: Context, options: ElysiaRequestOptions = {}) {
    this.elysia = ctx;
    this.raw = ctx.request;
    this.options = options;
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
    if (this.options.trustProxy) {
      const forwardedHost = this.get('x-forwarded-host');
      if (forwardedHost) return forwardedHost.split(',')[0]!.trim();
    }
    return this.parsedUrl.hostname;
  }

  public get protocol(): string {
    if (this.options.trustProxy) {
      const forwardedProto = this.get('x-forwarded-proto');
      if (forwardedProto) return forwardedProto.split(',')[0]!.trim();
    }
    return this.parsedUrl.protocol.replace(':', '');
  }

  public get ip(): string | undefined {
    const directIp = this.directIp;
    if (this.options.trustProxy) {
      const forwardedFor = this.parseForwardedFor();
      if (forwardedFor.length > 0) {
        return this.options.trustProxy(forwardedFor, directIp);
      }
      const realIp = this.get('x-real-ip');
      if (realIp) return realIp;
    }
    return directIp;
  }

  public get cookies(): Record<string, unknown> {
    return this.elysia.cookie as unknown as Record<string, unknown>;
  }

  public get rawBody(): Buffer | undefined {
    return (this.raw as Request & { rawBody?: Buffer }).rawBody;
  }

  public get(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  public header(name: string): string | undefined {
    return this.get(name);
  }

  private get directIp(): string | undefined {
    if (this._directIp !== undefined) return this._directIp ?? undefined;
    const server = this.elysia.server;
    if (!server) {
      this._directIp = null;
      return undefined;
    }
    try {
      const resolved = server.requestIP(this.raw)?.address;
      this._directIp = resolved ?? null;
      return resolved;
    } catch {
      this._directIp = null;
      return undefined;
    }
  }

  private parseForwardedFor(): string[] {
    if (this._forwardedFor !== undefined) return this._forwardedFor;
    const value = this.get('x-forwarded-for');
    this._forwardedFor = value
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return this._forwardedFor;
  }
}
