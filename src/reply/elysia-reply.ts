import type { Context } from 'elysia';

type HeaderValue = string | string[] | number;

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
    return this.headerStore[name.toLowerCase()];
  }

  public getHeaders(): Record<string, string | string[]> {
    return this.headerStore;
  }

  public hasHeader(name: string): boolean {
    return name.toLowerCase() in this.elysia.set.headers;
  }

  public removeHeader(name: string): this {
    delete this.headerStore[name.toLowerCase()];
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

  /** @internal — used by ElysiaAdapter to finalize the response; not part of the public API. */
  public _toResponse(): unknown {
    if (this._redirect) {
      return new Response(null, {
        status: this._redirect.status,
        headers: { Location: this._redirect.url },
      });
    }
    if (this._stream) {
      return new Response(this._stream, {
        status: this._statusCode,
        headers: this.elysia.set.headers as Record<string, string>,
      });
    }
    return this._body;
  }
}
