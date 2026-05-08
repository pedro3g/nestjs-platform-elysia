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
    (this.elysia.set.headers as Record<string, HeaderValue>)[name.toLowerCase()] = Array.isArray(
      value,
    )
      ? value.join(', ')
      : String(value);
    return this;
  }

  public setHeader(name: string, value: HeaderValue): this {
    return this.header(name, value);
  }

  public getHeader(name: string): string | undefined {
    const headers = this.elysia.set.headers as Record<string, string>;
    return headers[name.toLowerCase()];
  }

  public getHeaders(): Record<string, string> {
    return { ...(this.elysia.set.headers as Record<string, string>) };
  }

  public hasHeader(name: string): boolean {
    return name.toLowerCase() in this.elysia.set.headers;
  }

  public removeHeader(name: string): this {
    const headers = this.elysia.set.headers as Record<string, string>;
    delete headers[name.toLowerCase()];
    return this;
  }

  public appendHeader(name: string, value: HeaderValue): this {
    const key = name.toLowerCase();
    const headers = this.elysia.set.headers as Record<string, string>;
    const existing = headers[key];
    const next = Array.isArray(value) ? value.join(', ') : String(value);
    headers[key] = existing ? `${existing}, ${next}` : next;
    return this;
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
