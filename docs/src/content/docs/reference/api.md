---
title: API Reference
description: Full API surface of nestjs-platform-elysia — adapters, decorators, interfaces.
sidebar:
  order: 1
---

## `ElysiaAdapter`

Extends `AbstractHttpAdapter` from `@nestjs/core`. Pass it to `NestFactory.create()`.

```ts
new ElysiaAdapter(options?: ElysiaAdapterOptions | ElysiaInstance)
```

Accepts either an `ElysiaAdapterOptions` object (forwarded to `new Elysia(...)`) or a pre-built Elysia instance — useful when you want to wire plugins / decorators / macros before Nest takes over.

### Options

```ts
type ElysiaAdapterOptions = ElysiaConfig<string> & {
  trustProxy?: boolean | TrustProxyResolver;
};

type TrustProxyResolver = (
  forwardedFor: string[],
  directIp: string | undefined,
) => string | undefined;
```

See [Trust Proxy](/nestjs-platform-elysia/guides/trust-proxy/) for `trustProxy` semantics.

## `ElysiaWsAdapter`

WebSocket adapter that runs on the same Bun server as the HTTP adapter.

```ts
new ElysiaWsAdapter(app: NestElysiaApplication)
app.useWebSocketAdapter(new ElysiaWsAdapter(app));
```

See [WebSocket Gateways](/nestjs-platform-elysia/guides/websockets/) for usage.

## Decorators

| Decorator | Purpose |
|---|---|
| `@RouteSchema(schema)` | Attach a TypeBox / Zod schema to the route. Validation runs at the Elysia layer, returns `422` on failure. |
| `@RouteHook(hooks)` | Attach Elysia lifecycle hooks per route (`parse`, `transform`, `beforeHandle`, `afterHandle`, `afterResponse`, `mapResponse`, `error`). |
| `@RouteConfig(config)` | Pass arbitrary Elysia route config (consumed by plugins). |
| `@RouteDetail(detail)` | OpenAPI-style metadata (consumed by `@elysiajs/openapi` if registered). |

See [Route Decorators](/nestjs-platform-elysia/guides/route-decorators/) for examples.

## `NestElysiaApplication`

Type returned by `NestFactory.create<NestElysiaApplication>(...)`. Extends `INestApplication` with adapter methods exposed via Nest's adapter `Proxy`:

```ts
interface NestElysiaApplication extends INestApplication {
  getHttpAdapter(): HttpServer<ElysiaRequest, ElysiaReply, AnyElysia>;
  inject(request: Request): Promise<Response>;
  register(plugin: unknown): this;
  mount(path: string, handler: unknown): this;
  useBodyParser(type: string | string[], options?: NestElysiaBodyParserOptions, parser?: BodyParserHandler): this;
  enableCors(options?: CORSConfig): this;
}
```

| Method | Purpose |
|---|---|
| `inject(request)` | Programmatic dispatch (no port bound). Used for tests. |
| `register(plugin)` | Mounts an Elysia plugin (e.g. `swagger()`, `bearer()`). |
| `mount(path, handler)` | Mounts a sub-Elysia or a fetch handler at the given path. |
| `useBodyParser(type, opts?, parser?)` | Per-content-type parser registration. See [Body Parsing](/nestjs-platform-elysia/guides/body-parsing/). |
| `enableCors(opts?)` | Lazy-loads `@elysiajs/cors` and registers it. |

## `ElysiaRequest`

Wrapper around Elysia's `Context` exposing Express-style accessors. Available through `@Req()` injection.

```ts
class ElysiaRequest {
  readonly elysia: Context;       // raw Elysia Context (escape hatch)
  readonly raw: Request;          // raw Web Request

  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
  headers: Record<string, string | undefined>;
  cookies: Record<string, unknown>;
  rawBody?: Buffer;               // populated when rawBody capture is enabled

  method: string;
  url: string;
  originalUrl: string;
  path: string;                   // request URL path
  route: string;                  // matched route pattern
  hostname: string;               // honors X-Forwarded-Host when trustProxy is on
  protocol: string;               // honors X-Forwarded-Proto when trustProxy is on
  ip?: string;                    // honors X-Forwarded-For / X-Real-IP when trustProxy is on

  get(name: string): string | undefined;
  header(name: string): string | undefined;
}
```

## `ElysiaReply`

Mutable Express/Fastify-style response wrapper. Available through `@Res({ passthrough: true })` injection.

```ts
class ElysiaReply {
  readonly elysia: Context;       // raw Elysia Context (escape hatch)
  readonly raw: Request;
  readonly sent: boolean;
  statusCode: number;

  status(code: number): this;
  code(code: number): this;
  header(name: string, value: HeaderValue): this;
  setHeader(name: string, value: HeaderValue): this;
  appendHeader(name: string, value: HeaderValue): this;  // accumulates Set-Cookie as array
  removeHeader(name: string): this;
  hasHeader(name: string): boolean;
  getHeader(name: string): string | string[] | undefined;
  getHeaders(): Record<string, string | string[]>;
  type(contentType: string): this;

  send(body?: unknown): this;
  end(message?: unknown): this;
  json(body: unknown): this;
  redirect(url: string): this;
  redirect(status: number, url: string): this;
  stream(stream: ReadableStream<unknown>): this;
}
```

## Constants

```ts
export const ELYSIA_ROUTE_SCHEMA_METADATA = '__elysia_route_schema__';
export const ELYSIA_ROUTE_HOOK_METADATA = '__elysia_route_hook__';
export const ELYSIA_ROUTE_CONFIG_METADATA = '__elysia_route_config__';
export const ELYSIA_ROUTE_DETAIL_METADATA = '__elysia_route_detail__';
```

Useful when writing custom decorators / interceptors that want to inspect the same metadata.
