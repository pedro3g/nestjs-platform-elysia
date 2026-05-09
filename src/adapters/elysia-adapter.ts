import { EventEmitter } from 'node:events';
import {
  HttpStatus,
  Logger,
  RequestMethod,
  StreamableFile,
  VERSION_NEUTRAL,
  type VersioningOptions,
} from '@nestjs/common';
import type { NestApplicationOptions, VersionValue } from '@nestjs/common/interfaces';
import { AbstractHttpAdapter } from '@nestjs/core';
import {
  ELYSIA_ROUTE_CONFIG_METADATA,
  ELYSIA_ROUTE_DETAIL_METADATA,
  ELYSIA_ROUTE_HOOK_METADATA,
  ELYSIA_ROUTE_SCHEMA_METADATA,
} from '../constants';
import type {
  ElysiaAdapterOptions,
  TrustProxyOption,
  TrustProxyResolver,
} from '../interfaces/elysia-adapter-options.interface';
import type {
  BodyParserHandler,
  NestElysiaBodyParserOptions,
} from '../interfaces/nest-elysia-body-parser-options.interface';
import { ElysiaReply } from '../reply/elysia-reply';
import { ElysiaRequest } from '../request/elysia-request';
import { compilePathMatcher, normalizePath } from '../utils/path-utils';
import { extractRequestVersion, versionMatches } from '../utils/version-utils';

type AnyElysiaInstance = {
  route: (method: string, path: string, handler: unknown, hook?: unknown) => unknown;
  use: (plugin: unknown) => unknown;
  mount: (path: string, handler: unknown) => unknown;
  onError: (handler: unknown) => unknown;
  onRequest: (handler: unknown) => unknown;
  onResponse: (handler: unknown) => unknown;
  onBeforeHandle: (handler: unknown) => unknown;
  onParse: (handler: unknown) => unknown;
  handle: (request: Request) => Promise<Response>;
  listen: (
    options: number | string | { hostname?: string; port?: number },
    callback?: (server: { hostname: string; port: number }) => void,
  ) => unknown;
  stop: (closeActiveConnections?: boolean) => Promise<void> | void;
  server: unknown;
};

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  json: 'application/json',
  urlencoded: 'application/x-www-form-urlencoded',
  text: 'text/plain',
  raw: 'application/octet-stream',
};

function normalizeContentType(type: string): string {
  return CONTENT_TYPE_ALIASES[type] ?? type.split(';')[0]!.trim().toLowerCase();
}

type ElysiaCtorArg = ElysiaAdapterOptions | object | undefined;

interface VersionedHandlerEntry {
  version: VersionValue | undefined;
  handler: (req: ElysiaRequest, res: ElysiaReply, next?: () => void) => unknown;
  hookMeta?: unknown;
  schemaMeta?: unknown;
  configMeta?: unknown;
  detailMeta?: unknown;
}

interface RouteEntry {
  method: HttpMethodUpper;
  path: string;
  handlers: VersionedHandlerEntry[];
  registered: boolean;
}

interface MiddlewareEntry {
  method: RequestMethod;
  matcher: RegExp;
  callback: (req: ElysiaRequest, res: ElysiaReply, next: (err?: unknown) => void) => unknown;
}

type HttpMethodUpper = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'ALL';

// biome-ignore lint/complexity/noBannedTypes: must match @nestjs/core AbstractHttpAdapter abstract signatures that use Function
type NestFunction = Function;

const METHOD_KEY = (method: string, path: string): string => `${method} ${path}`;

export class ElysiaAdapter extends AbstractHttpAdapter<unknown, ElysiaRequest, ElysiaReply> {
  protected readonly logger = new Logger(ElysiaAdapter.name);

  private routeTable = new Map<string, RouteEntry>();
  private middlewares: MiddlewareEntry[] = [];
  private middlewareHookInstalled = false;
  private versioningOptions?: VersioningOptions;
  private notFoundHandler?: (req: ElysiaRequest, res: ElysiaReply) => unknown;
  private errorHandler?: (err: unknown, req: ElysiaRequest, res: ElysiaReply) => unknown;
  private bunServer: { hostname: string; port: number; stop: () => void } | null = null;
  private readonly serverProxy = new HttpServerProxy();
  private trustProxy?: TrustProxyResolver;
  private globalRawBody = false;
  private rawBodyTypes = new Set<string>();
  private customParsers = new Map<string, BodyParserHandler>();
  private parseHookInstalled = false;

  constructor(instanceOrOptions?: ElysiaCtorArg) {
    const isInstance =
      !!instanceOrOptions &&
      typeof instanceOrOptions === 'object' &&
      'route' in instanceOrOptions &&
      'handle' in instanceOrOptions;

    let trustProxyOpt: TrustProxyOption | undefined;
    let elysiaInput: ElysiaCtorArg = instanceOrOptions;

    if (instanceOrOptions && typeof instanceOrOptions === 'object' && !isInstance) {
      const { trustProxy, ...rest } = instanceOrOptions as ElysiaAdapterOptions;
      trustProxyOpt = trustProxy;
      elysiaInput = rest as ElysiaCtorArg;
    }

    const elysia = ElysiaAdapter.resolveInstance(elysiaInput);
    super(elysia);

    this.trustProxy = ElysiaAdapter.resolveTrustProxy(trustProxyOpt);
  }

  private static resolveInstance(input?: ElysiaCtorArg): AnyElysiaInstance {
    if (input && typeof input === 'object' && 'route' in input && 'handle' in input) {
      return input as AnyElysiaInstance;
    }
    const ElysiaCtor = require('elysia').Elysia as new (
      opts?: ElysiaAdapterOptions,
    ) => AnyElysiaInstance;
    return new ElysiaCtor(input as ElysiaAdapterOptions | undefined);
  }

  private static resolveTrustProxy(opt?: TrustProxyOption): TrustProxyResolver | undefined {
    if (opt === true) return (forwardedFor) => forwardedFor[0];
    if (typeof opt === 'function') return opt;
    return undefined;
  }

  private wrapRequest(ctx: ConstructorParameters<typeof ElysiaRequest>[0]): ElysiaRequest {
    return new ElysiaRequest(ctx, { trustProxy: this.trustProxy });
  }

  private get app(): AnyElysiaInstance {
    return this.instance as AnyElysiaInstance;
  }

  public override async init(): Promise<void> {
    this.installErrorBridge();
    this.installNotFoundBridge();
    this.installMiddlewareDispatcher();
  }

  public override initHttpServer(_options: NestApplicationOptions): void {
    this.httpServer = this.serverProxy;
  }

  public override getHttpServer<T = unknown>(): T {
    return this.serverProxy as unknown as T;
  }

  public override getInstance<T = AnyElysiaInstance>(): T {
    return this.instance as T;
  }

  public override getType(): string {
    return 'elysia';
  }

  public override get(...args: unknown[]): unknown {
    return this.registerRoute('GET', args);
  }
  public override post(...args: unknown[]): unknown {
    return this.registerRoute('POST', args);
  }
  public override put(...args: unknown[]): unknown {
    return this.registerRoute('PUT', args);
  }
  public override delete(...args: unknown[]): unknown {
    return this.registerRoute('DELETE', args);
  }
  public override patch(...args: unknown[]): unknown {
    return this.registerRoute('PATCH', args);
  }
  public override options(...args: unknown[]): unknown {
    return this.registerRoute('OPTIONS', args);
  }
  public override head(...args: unknown[]): unknown {
    return this.registerRoute('HEAD', args);
  }
  public override all(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override search(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override propfind(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override proppatch(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override mkcol(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override copy(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override move(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override lock(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }
  public override unlock(...args: unknown[]): unknown {
    return this.registerRoute('ALL', args);
  }

  public override use(...args: unknown[]): this {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      this.app.use(args[0]);
      return this;
    }
    this.logger.warn(
      'ElysiaAdapter.use() with a middleware function is not supported as a global hook; use MiddlewareConsumer.apply().forRoutes() instead.',
    );
    return this;
  }

  public register(plugin: unknown): this {
    this.app.use(plugin);
    return this;
  }

  public mount(path: string, handler: unknown): this {
    this.app.mount(path, handler);
    return this;
  }

  public override async listen(
    portOrOptions: number | string | { hostname?: string; port?: number; path?: string },
    hostnameOrCallback?: string | ((server: unknown) => void),
    callback?: (server: unknown) => void,
  ): Promise<unknown> {
    const opts: { hostname?: string; port?: number } = {};
    let cb: ((server: unknown) => void) | undefined;

    if (typeof portOrOptions === 'object' && portOrOptions !== null) {
      opts.port = portOrOptions.port;
      opts.hostname = portOrOptions.hostname;
      cb = typeof hostnameOrCallback === 'function' ? hostnameOrCallback : callback;
    } else {
      opts.port = Number(portOrOptions);
      if (typeof hostnameOrCallback === 'string') {
        opts.hostname = hostnameOrCallback;
        cb = callback;
      } else {
        cb = hostnameOrCallback;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        this.app.listen(opts.port ?? 3000, (server) => {
          this.bunServer = server as unknown as typeof this.bunServer;
          this.serverProxy.markListening({
            port: opts.port ?? 3000,
            address: opts.hostname ?? '0.0.0.0',
          });
          this.serverProxy.emit('listening');
          cb?.(server);
          resolve(this.app.server);
        });
      } catch (err) {
        this.serverProxy.emit('error', err);
        reject(err);
      }
    });
  }

  public async inject(request: Request): Promise<Response> {
    return this.app.handle(request);
  }

  public override async close(): Promise<void> {
    try {
      if (this.bunServer) await this.app.stop(true);
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (!message.includes("isn't running")) {
        this.logger.warn(`Error stopping Elysia server: ${message}`);
      }
    } finally {
      this.bunServer = null;
      this.serverProxy.markClosed();
      this.serverProxy.emit('close');
    }
  }

  public override status(response: ElysiaReply, statusCode: number): unknown {
    return response.status(statusCode);
  }

  public override reply(response: ElysiaReply, body: unknown, statusCode?: number): unknown {
    if (statusCode !== undefined) response.status(statusCode);

    if (body instanceof StreamableFile) {
      const headers = body.getHeaders();
      if (!response.hasHeader('content-type') && headers.type) response.type(headers.type);
      if (!response.hasHeader('content-disposition') && headers.disposition) {
        response.header('content-disposition', headers.disposition);
      }
      if (!response.hasHeader('content-length') && headers.length !== undefined) {
        response.header('content-length', String(headers.length));
      }
      const stream = body.getStream() as unknown as ReadableStream<unknown>;
      return response.stream(stream);
    }

    if (
      response.hasHeader('content-type') &&
      response.getHeader('content-type') !== 'application/json' &&
      typeof body === 'object' &&
      body !== null &&
      'statusCode' in body &&
      typeof (body as { statusCode: unknown }).statusCode === 'number' &&
      (body as { statusCode: number }).statusCode >= HttpStatus.BAD_REQUEST
    ) {
      this.logger.warn(
        "Content-Type doesn't match Reply body; consider a custom ExceptionFilter for non-JSON responses.",
      );
      response.type('application/json');
    }

    return response.send(body);
  }

  public override end(response: ElysiaReply, message?: string): unknown {
    return response.end(message);
  }

  public override redirect(response: ElysiaReply, statusCode: number, url: string): unknown {
    return response.redirect(statusCode || HttpStatus.FOUND, url);
  }

  public override render(response: ElysiaReply, _view: string, _options: unknown): unknown {
    this.logger.warn('ElysiaAdapter.render() is not supported; returning a 501.');
    return response.status(HttpStatus.NOT_IMPLEMENTED).send('View rendering is not supported.');
  }

  public override setErrorHandler(
    handler: (err: unknown, req: unknown, res: unknown) => unknown,
  ): void {
    this.errorHandler = handler as typeof this.errorHandler;
  }

  public override setNotFoundHandler(handler: (req: unknown, res: unknown) => unknown): void {
    this.notFoundHandler = handler as typeof this.notFoundHandler;
  }

  public override isHeadersSent(response: ElysiaReply): boolean {
    return response.sent;
  }

  public override getHeader(response: ElysiaReply, name: string): string | string[] | undefined {
    return response.getHeader(name);
  }

  public override setHeader(response: ElysiaReply, name: string, value: string): unknown {
    return response.header(name, value);
  }

  public override appendHeader(response: ElysiaReply, name: string, value: string): unknown {
    return response.appendHeader(name, value);
  }

  public override getRequestHostname(request: ElysiaRequest): string {
    return request.hostname;
  }

  public override getRequestMethod(request: ElysiaRequest): string {
    return request.method;
  }

  public override getRequestUrl(request: ElysiaRequest): string {
    return request.originalUrl;
  }

  public override useStaticAssets(..._args: unknown[]): unknown {
    this.logger.warn(
      'ElysiaAdapter.useStaticAssets() is not implemented; use the @elysiajs/static plugin via app.register().',
    );
    return this;
  }

  public override setViewEngine(_engine: string): unknown {
    this.logger.warn('ElysiaAdapter.setViewEngine() is not implemented.');
    return this;
  }

  public override registerParserMiddleware(_prefix?: string, rawBody?: boolean): void {
    if (rawBody) {
      this.globalRawBody = true;
      this.installParseHook();
    }
  }

  public useBodyParser(
    type: string | string[],
    rawBody?: boolean,
    _options?: NestElysiaBodyParserOptions,
    parser?: BodyParserHandler,
  ): this {
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      const normalized = normalizeContentType(t);
      if (rawBody) this.rawBodyTypes.add(normalized);
      if (parser) this.customParsers.set(normalized, parser);
    }
    if (this.rawBodyTypes.size > 0 || this.customParsers.size > 0 || this.globalRawBody) {
      this.installParseHook();
    }
    return this;
  }

  private installParseHook(): void {
    if (this.parseHookInstalled) return;
    this.parseHookInstalled = true;

    this.app.onParse(async (ctx: { request: Request }, contentType: string) => {
      const type = normalizeContentType(contentType ?? '');
      const customParser = this.customParsers.get(type);
      const useBodyParserNarrowed = this.rawBodyTypes.size > 0;
      const wantsRawBody = useBodyParserNarrowed ? this.rawBodyTypes.has(type) : this.globalRawBody;

      if (!customParser && !wantsRawBody) return undefined;

      const buffer = Buffer.from(await ctx.request.arrayBuffer());
      (ctx.request as Request & { rawBody?: Buffer }).rawBody = buffer;

      if (customParser) {
        return customParser({ request: ctx.request, contentType: type, rawBody: buffer });
      }

      return ElysiaAdapter.defaultParseFor(type, buffer);
    });
  }

  private static defaultParseFor(type: string, buffer: Buffer): unknown {
    const text = buffer.toString('utf-8');
    if (type === 'application/json') {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    }
    if (type === 'application/x-www-form-urlencoded') {
      return Object.fromEntries(new URLSearchParams(text));
    }
    if (type.startsWith('text/')) {
      return text;
    }
    return buffer;
  }

  public enableCors(options?: unknown): unknown {
    try {
      const { cors } = require('@elysiajs/cors');
      this.app.use(cors(options));
    } catch (_err) {
      throw new Error(
        '@elysiajs/cors is not installed. Run `bun add @elysiajs/cors` to enable CORS.',
      );
    }
    return this;
  }

  public override applyVersionFilter(
    handler: (...args: any[]) => any,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): (req: ElysiaRequest, res: ElysiaReply, next: () => void) => (...args: any[]) => any {
    if (!this.versioningOptions) this.versioningOptions = versioningOptions;
    const versioned = handler as ((
      req: ElysiaRequest,
      res: ElysiaReply,
      next: () => void,
    ) => (...args: any[]) => any) & {
      version: VersionValue;
    };
    versioned.version = version;
    return versioned;
  }

  public override async createMiddlewareFactory(
    method: RequestMethod,
  ): Promise<(path: string, callback: NestFunction) => unknown> {
    return (path: string, callback: NestFunction) => {
      this.middlewares.push({
        method,
        matcher: compilePathMatcher(path),
        callback: callback as MiddlewareEntry['callback'],
      });
      return this;
    };
  }

  private registerRoute(method: HttpMethodUpper, args: unknown[]): unknown {
    const path = (args.length >= 2 ? args[0] : '/') as string | RegExp;
    const handler = (args.length >= 2 ? args[1] : args[0]) as VersionedHandlerEntry['handler'];
    const normalizedPath = normalizePath(path);
    const key = METHOD_KEY(method, normalizedPath);

    const handlerWithMeta = handler as VersionedHandlerEntry['handler'] & {
      version?: VersionValue;
    };

    const existing = this.routeTable.get(key);
    const entry: VersionedHandlerEntry = {
      version: handlerWithMeta.version,
      handler,
      schemaMeta: Reflect.getMetadata?.(ELYSIA_ROUTE_SCHEMA_METADATA, handler),
      hookMeta: Reflect.getMetadata?.(ELYSIA_ROUTE_HOOK_METADATA, handler),
      configMeta: Reflect.getMetadata?.(ELYSIA_ROUTE_CONFIG_METADATA, handler),
      detailMeta: Reflect.getMetadata?.(ELYSIA_ROUTE_DETAIL_METADATA, handler),
    };

    if (existing) {
      existing.handlers.push(entry);
      return this.app;
    }

    const route: RouteEntry = {
      method,
      path: normalizedPath,
      handlers: [entry],
      registered: false,
    };
    this.routeTable.set(key, route);

    const elysiaMethod = method === 'ALL' ? 'ALL' : method;
    const localHook = this.buildLocalHook(entry);

    this.app.route(
      elysiaMethod,
      normalizedPath,
      this.makeRouteHandler(route),
      localHook ?? undefined,
    );
    route.registered = true;
    return this.app;
  }

  private buildLocalHook(entry: VersionedHandlerEntry): Record<string, unknown> | undefined {
    const hook: Record<string, unknown> = {};
    if (entry.schemaMeta && typeof entry.schemaMeta === 'object') {
      Object.assign(hook, entry.schemaMeta);
    }
    if (entry.hookMeta && typeof entry.hookMeta === 'object') {
      Object.assign(hook, entry.hookMeta);
    }
    if (entry.configMeta && typeof entry.configMeta === 'object') {
      Object.assign(hook, entry.configMeta);
    }
    if (entry.detailMeta && typeof entry.detailMeta === 'object') {
      hook.detail = entry.detailMeta;
    }
    return Object.keys(hook).length > 0 ? hook : undefined;
  }

  private makeRouteHandler(route: RouteEntry) {
    return async (ctx: unknown): Promise<unknown> => {
      const req = this.wrapRequest(ctx as ConstructorParameters<typeof ElysiaRequest>[0]);
      const reply = new ElysiaReply(ctx as ConstructorParameters<typeof ElysiaReply>[0]);

      const handler = this.pickHandler(route, req);
      if (!handler) {
        reply.status(HttpStatus.NOT_FOUND).send({ statusCode: 404, message: 'Not Found' });
        return reply._toResponse();
      }

      await Promise.resolve(handler(req, reply, () => {}));
      return reply._toResponse();
    };
  }

  private pickHandler(
    route: RouteEntry,
    req: ElysiaRequest,
  ): VersionedHandlerEntry['handler'] | undefined {
    if (route.handlers.length === 1) return route.handlers[0]?.handler;
    if (!this.versioningOptions) return route.handlers[0]?.handler;

    const requestVersion = extractRequestVersion(req, this.versioningOptions);
    const matched = route.handlers.find((h) =>
      h.version === undefined ? false : versionMatches(h.version, requestVersion),
    );
    if (matched) return matched.handler;

    const neutral = route.handlers.find(
      (h) => h.version === VERSION_NEUTRAL || h.version === undefined,
    );
    return neutral?.handler;
  }

  private installErrorBridge(): void {
    this.app.onError(async (ctx: unknown) => {
      const c = ctx as { error: unknown; code: string; request: Request; set: { status?: number } };
      if (c.code === 'NOT_FOUND' && this.notFoundHandler) {
        const elysiaCtx = c as unknown as ConstructorParameters<typeof ElysiaRequest>[0];
        const req = this.wrapRequest(elysiaCtx);
        const reply = new ElysiaReply(elysiaCtx);
        await Promise.resolve(this.notFoundHandler(req, reply));
        return reply._toResponse();
      }
      if (isElysiaNativeError(c.code)) {
        // VALIDATION/PARSE/etc — let Elysia render its own native error response.
        return undefined;
      }
      if (this.errorHandler) {
        const elysiaCtx = c as unknown as ConstructorParameters<typeof ElysiaRequest>[0];
        const req = this.wrapRequest(elysiaCtx);
        const reply = new ElysiaReply(elysiaCtx);
        await Promise.resolve(this.errorHandler(c.error, req, reply));
        return reply._toResponse();
      }
      return undefined;
    });
  }

  private installNotFoundBridge(): void {
    // 404s in Elysia surface as code === 'NOT_FOUND' inside onError, handled above.
  }

  private installMiddlewareDispatcher(): void {
    if (this.middlewareHookInstalled) return;
    this.middlewareHookInstalled = true;

    this.app.onBeforeHandle(async (ctx: unknown) => {
      if (this.middlewares.length === 0) return undefined;

      const elysiaCtx = ctx as ConstructorParameters<typeof ElysiaRequest>[0];
      const req = this.wrapRequest(elysiaCtx);
      const reply = new ElysiaReply(elysiaCtx);
      const path = req.path;
      const methodName = req.method.toUpperCase();

      const matched = this.middlewares.filter((m) => {
        const mwMethodStr = methodEnumToString(m.method);
        if (mwMethodStr !== 'ALL' && mwMethodStr !== methodName) return false;
        return m.matcher.test(path);
      });

      for (const mw of matched) {
        let nextCalled = false;
        let nextErr: unknown;
        await new Promise<void>((resolve) => {
          const next = (err?: unknown) => {
            nextCalled = true;
            nextErr = err;
            resolve();
          };
          try {
            const result = mw.callback(req, reply, next);
            if (result instanceof Promise) {
              result
                .then(() => !nextCalled && resolve())
                .catch((err) => {
                  nextErr = err;
                  resolve();
                });
            } else if (!nextCalled && reply.sent) {
              resolve();
            } else if (!nextCalled) {
              setImmediate(() => resolve());
            }
          } catch (err) {
            nextErr = err;
            resolve();
          }
        });

        if (nextErr) throw nextErr;
        if (reply.sent) return reply._toResponse();
      }

      return undefined;
    });
  }

  public override setOnRequestHook(hook: (...args: any[]) => any): void {
    this.app.onRequest(async (ctx: unknown) => {
      const elysiaCtx = ctx as ConstructorParameters<typeof ElysiaRequest>[0];
      const req = this.wrapRequest(elysiaCtx);
      const reply = new ElysiaReply(elysiaCtx);
      await Promise.resolve(hook(req, reply, () => {}));
    });
  }

  public override setOnResponseHook(hook: (...args: any[]) => any): void {
    this.app.onResponse(async (ctx: unknown) => {
      const elysiaCtx = ctx as ConstructorParameters<typeof ElysiaRequest>[0];
      const req = this.wrapRequest(elysiaCtx);
      const reply = new ElysiaReply(elysiaCtx);
      await Promise.resolve(hook(req, reply, () => {}));
    });
  }
}

class HttpServerProxy extends EventEmitter {
  private _listening = false;
  private _address: { port: number; address: string } | null = null;

  public get listening(): boolean {
    return this._listening;
  }

  public address(): { port: number; address: string; family: string } | null {
    if (!this._address) return null;
    return { ...this._address, family: 'IPv4' };
  }

  public markListening(addr: { port: number; address: string }): void {
    this._address = addr;
    this._listening = true;
  }

  public markClosed(): void {
    this._listening = false;
    this._address = null;
  }

  public close(callback?: (err?: Error) => void): this {
    this._listening = false;
    callback?.();
    return this;
  }
}

function isElysiaNativeError(code: string): boolean {
  return (
    code === 'VALIDATION' ||
    code === 'PARSE' ||
    code === 'INVALID_COOKIE_SIGNATURE' ||
    code === 'INVALID_FILE_TYPE'
  );
}

function methodEnumToString(method: RequestMethod): string {
  switch (method) {
    case RequestMethod.GET:
      return 'GET';
    case RequestMethod.POST:
      return 'POST';
    case RequestMethod.PUT:
      return 'PUT';
    case RequestMethod.DELETE:
      return 'DELETE';
    case RequestMethod.PATCH:
      return 'PATCH';
    case RequestMethod.OPTIONS:
      return 'OPTIONS';
    case RequestMethod.HEAD:
      return 'HEAD';
    default:
      return 'ALL';
  }
}
