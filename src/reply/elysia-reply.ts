import type { Context } from 'elysia';

type HeaderValue = string | string[] | number;

const TO_RESPONSE = Symbol.for('nestjs-platform-elysia.toResponse');

export class ElysiaReply {
  public readonly elysia: Context;
  public readonly raw: Request;

  private _body: unknown = undefined;
  private _statusCode = 200;
  private _sent = false;
  private _redirect?: { url: string; status: number };
  private _stream?: ReadableStream<unknown> | null;

  constructor(ctx: Context) {
    this.elysia = ctx;
    this.raw = ctx.request;
  }

  public get sent(): boolean {
    return this._sent;
  }

  public get statusCode(): number {
    return this._statusCode;
  }

  public set statusCode(code: number) {
    this.status(code);
  }

  public status(code: number): this {
    this._statusCode = code;
    this.elysia.set.status = code;
    return this;
  }

  public code(code: number): this {
    return this.status(code);
  }

  public header(name: string, value: HeaderValue): this {
    const key = name.toLowerCase();
    const headers = this.headerStore;
    if (key === 'set-cookie') {
      headers[key] = Array.isArray(value) ? value.map(String) : String(value);
      return this;
    }
    headers[key] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
    return this;
  }

  public setHeader(name: string, value: HeaderValue): this {
    return this.header(name, value);
  }

  public getHeader(name: string): string | string[] | undefined {
    const key = name.toLowerCase();
    return this.headerStore[key];
  }

  public getHeaders(): Record<string, string | string[]> {
    return this.headerStore;
  }

  public hasHeader(name: string): boolean {
    const key = name.toLowerCase();
    return key in this.elysia.set.headers;
  }

  public removeHeader(name: string): this {
    const key = name.toLowerCase();
    delete this.headerStore[key];
    return this;
  }

  public appendHeader(name: string, value: HeaderValue): this {
    const key = name.toLowerCase();
    const headers = this.headerStore;
    const existing = headers[key];
    const incoming = Array.isArray(value) ? value.map(String) : [String(value)];

    if (key === 'set-cookie') {
      const current = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
      const merged = [...current, ...incoming];
      headers[key] = merged.length === 1 ? merged[0]! : merged;
      return this;
    }

    const next = incoming.join(', ');
    if (existing === undefined) {
      headers[key] = next;
    } else if (Array.isArray(existing)) {
      headers[key] = [...existing, next];
    } else {
      headers[key] = `${existing}, ${next}`;
    }
    return this;
  }

  private get headerStore(): Record<string, string | string[]> {
    return this.elysia.set.headers as Record<string, string | string[]>;
  }

  public type(contentType: string): this {
    return this.header('content-type', contentType);
  }

  public send(body?: unknown): this {
    this._body = body;
    this._sent = true;
    return this;
  }

  public end(message?: unknown): this {
    return this.send(message);
  }

  public json(body: unknown): this {
    this.type('application/json');
    return this.send(body);
  }

  public redirect(url: string): this;
  public redirect(status: number, url: string): this;
  public redirect(...args: [string] | [number, string]): this {
    let status: number;
    let url: string;
    if (typeof args[0] === 'number') {
      status = args[0];
      url = args[1] as string;
    } else {
      status = 302;
      url = args[0];
    }
    this._redirect = { url, status };
    this._sent = true;
    this._statusCode = status;
    this.elysia.set.status = status;
    (this.elysia.set.headers as Record<string, string>).location = url;
    return this;
  }

  public stream(stream: ReadableStream<unknown>): this {
    this._stream = stream;
    this._sent = true;
    return this;
  }

  public [TO_RESPONSE](): unknown {
    if (this._redirect) {
      const headers = this.buildHeaders(this.headerStore);
      headers.set('location', this._redirect.url);
      return new Response(null, { status: this._redirect.status, headers });
    }
    if (this._stream) {
      return new Response(this._stream, {
        status: this._statusCode,
        headers: this.buildHeaders(this.headerStore),
      });
    }
    return this._body;
  }

  /** @internal — backwards-compatible name; prefer the symbol-keyed method. */
  public _toResponse(): unknown {
    return this[TO_RESPONSE]();
  }

  private buildHeaders(bag: Record<string, string | string[]>): Headers {
    const h = new Headers();
    for (const k of Object.keys(bag)) {
      const v = bag[k];
      if (Array.isArray(v)) {
        for (const item of v) h.append(k, item);
      } else if (v !== undefined) {
        h.set(k, v);
      }
    }
    return h;
  }
}

export const ELYSIA_REPLY_TO_RESPONSE = TO_RESPONSE;
