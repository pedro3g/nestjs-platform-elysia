# platform-elysia

NestJS HTTP adapter for [Elysia](https://elysiajs.com/) on [Bun](https://bun.sh/).

> ⚠️ **Bun runtime only.** Elysia uses `Bun.serve()` internally and does not run on Node.js. This adapter inherits that constraint.

## Why

NestJS gives you DI, modules, guards, pipes, interceptors, exception filters, and a clear architecture. Elysia gives you Bun-native performance, end-to-end type safety (Eden), TypeBox/Zod validation at the framework level, lifecycle hooks, and a rich plugin ecosystem.

This adapter lets you keep both: write Nest controllers as usual while still being able to register Elysia plugins, attach TypeBox schemas to routes, mount sub-apps, and use `app.handle()` for testing — without losing what makes Elysia worth choosing.

## Installation

```bash
bun add platform-elysia @nestjs/common @nestjs/core elysia
```

For CORS:

```bash
bun add @elysiajs/cors
```

## Quick start

```ts
import { NestFactory } from '@nestjs/core';
import { ElysiaAdapter, type NestElysiaApplication } from 'platform-elysia';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestElysiaApplication>(
    AppModule,
    new ElysiaAdapter(),
  );

  app.enableCors();

  await app.listen(3000);
}

bootstrap();
```

## Elysia features inside Nest controllers

### Route-level TypeBox / Zod schemas

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { t } from 'elysia';
import { RouteSchema } from 'platform-elysia';

@Controller('users')
export class UsersController {
  @Post()
  @RouteSchema({
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: 'email' }),
    }),
  })
  create(@Body() body: { name: string; email: string }) {
    return body;
  }
}
```

If the body doesn't match the schema, Elysia returns a `422` response with detailed validation errors **before** the request reaches the controller — Nest's pipeline never runs for invalid input.

### Other route metadata decorators

- `@RouteHook({ beforeHandle, afterHandle, parse, transform, mapResponse, error })` — attach Elysia lifecycle hooks per route
- `@RouteConfig({ tags, ... })` — arbitrary route config object
- `@RouteDetail({ summary, description, tags, deprecated, hide })` — OpenAPI-style metadata (consumed by `@elysiajs/openapi` if registered)

## Body parsing and `rawBody`

Elysia parses request bodies automatically based on `content-type`, so the common case needs no setup. For webhooks that need to verify a signature against the **exact bytes** of the request, opt into raw body capture:

```ts
const app = await NestFactory.create<NestElysiaApplication>(AppModule, new ElysiaAdapter(), {
  rawBody: true,
});
```

Then read it inside controllers / guards via `@Req()`:

```ts
import { Controller, Post, Req } from '@nestjs/common';
import type { ElysiaRequest } from 'platform-elysia';

@Controller('webhooks')
export class WebhooksController {
  @Post('stripe')
  stripe(@Req() req: ElysiaRequest) {
    const sig = req.get('stripe-signature');
    const verified = verify(req.rawBody!, sig);
  }
}
```

To narrow which content-types capture rawBody (when `rawBody: true` is on globally), call `app.useBodyParser('application/json')` for each type you want kept.

To register a **custom parser** for a content-type Elysia doesn't handle out of the box (e.g. protobuf):

```ts
app.useBodyParser(
  'application/x-protobuf',
  undefined,
  ({ rawBody, contentType }) => decodeProtobuf(rawBody),
);
```

The parser receives the raw `Buffer` and returns the parsed value Elysia exposes as `ctx.body` (and Nest exposes via `@Body()`).

## Trust proxy

When the app sits behind a reverse proxy (Cloudflare, ALB, nginx, Caddy), enable `trustProxy` so `request.ip`, `request.hostname` and `request.protocol` honor `X-Forwarded-For` / `X-Forwarded-Host` / `X-Forwarded-Proto` (with `X-Real-IP` as a fallback for the IP):

```ts
new ElysiaAdapter({ trustProxy: true });

new ElysiaAdapter({
  trustProxy: (forwardedFor, directIp) => {
    return forwardedFor[forwardedFor.length - 1];
  },
});
```

`true` resolves to the leftmost entry in `X-Forwarded-For`. Pass a function for custom logic — receives the parsed list and the direct connection IP, returns the resolved client IP (or `undefined` to fall back to direct).

## Application API

`NestElysiaApplication` exposes adapter methods directly on the app instance through Nest's adapter Proxy:

```ts
const app = await NestFactory.create<NestElysiaApplication>(AppModule, new ElysiaAdapter());

app.register(swagger());                       // Elysia plugin
app.mount('/legacy', someFetchHandler);        // sub-app or fetch handler
const response = await app.inject(request);    // programmatic dispatch
const elysia = app.getHttpAdapter().getInstance(); // raw Elysia escape hatch
```

## Testing

Use `app.inject()` to dispatch a `Request` against the running app without binding a port:

```ts
import { Test } from '@nestjs/testing';
import { ElysiaAdapter, type NestElysiaApplication } from 'platform-elysia';

let app: NestElysiaApplication;

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestElysiaApplication>(new ElysiaAdapter());
  await app.init();
});

afterEach(() => app.close());

test('GET /users', async () => {
  const res = await app.inject(new Request('http://localhost/users'));
  expect(res.status).toBe(200);
});
```

## What's supported

- All HTTP methods, route params, query, body, default status codes
- Full Nest pipeline: Guards, Pipes, Interceptors, Exception Filters
- `@RouteSchema` with TypeBox/Zod for framework-level validation
- Versioning: URI, Header, Media-Type, Custom
- CORS via `@elysiajs/cors`
- `MiddlewareConsumer.apply().forRoutes()` (Express-style middleware)
- `app.register(plugin)` for Elysia plugins (swagger, bearer, openapi, etc.)
- `app.mount(path, handler)` for sub-apps and fetch handlers
- `app.inject(Request)` for programmatic testing

## Known limitations

- **WebSockets** — `@WebSocketGateway()` is not bridged. Workaround: `app.register(elysiaWs)` directly.
- **`useStaticAssets()`** — not implemented. Use `app.register(staticPlugin())` from `@elysiajs/static`.
- **`setViewEngine()`** — not implemented (no SSR templating support).
- **`@Req()` / `@Res()`** — receive `ElysiaRequest` / `ElysiaReply` wrappers, not Express request/response. Express-only APIs like `.is()`, `.accepts()`, `.signedCookies` are not exposed.
- **Microservices / hybrid app** — untested.

## Versioning

Pre-1.0. APIs may change between minor versions. See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)
