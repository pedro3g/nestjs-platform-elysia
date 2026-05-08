---
title: Testing
description: Test NestJS apps backed by ElysiaAdapter without binding a TCP port — uses Elysia's app.handle() under the hood.
sidebar:
  order: 6
---

`ElysiaAdapter` exposes `app.inject(request: Request) => Promise<Response>` for programmatic testing — equivalent to Fastify's `app.inject()` or supertest's pattern, but using the standard Web `Request` / `Response` types from Bun.

`app.inject()` runs **the full Nest pipeline** (guards, pipes, interceptors, exception filters, controllers) plus Elysia's lifecycle (parse, validate, hooks). It does **not** open a TCP port, so tests are fast, parallel-safe, and don't fight over ephemeral ports.

## Bootstrap a test app

```ts title="cats.spec.ts"
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Test } from '@nestjs/testing';
import { ElysiaAdapter, type NestElysiaApplication } from 'nestjs-platform-elysia';
import { CatsModule } from '../src/cats/cats.module';

describe('cats', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CatsModule] }).compile();
    app = moduleRef.createNestApplication<NestElysiaApplication>(new ElysiaAdapter(), {
      logger: false,
    });
    await app.init();
  });

  afterEach(() => app.close());

  test('GET /cats returns the list', async () => {
    const res = await app.inject(new Request('http://localhost/cats'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, name: 'Mia' }]);
  });
});
```

## Sending requests with bodies / headers

The `Request` constructor takes any standard `RequestInit` — body, headers, method, etc.

```ts
const res = await app.inject(
  new Request('http://localhost/cats', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer admin-token',
    },
    body: JSON.stringify({ name: 'Loki' }),
  }),
);
```

## A reusable helper

```ts title="test/helpers/inject.ts"
import type { NestElysiaApplication } from 'nestjs-platform-elysia';

export async function inject(
  app: NestElysiaApplication,
  request: { method?: string; url: string; headers?: Record<string, string>; body?: unknown },
): Promise<Response> {
  const url = request.url.startsWith('http') ? request.url : `http://localhost${request.url}`;
  const init: RequestInit = { method: request.method ?? 'GET', headers: request.headers };
  if (request.body !== undefined) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    init.headers = { 'content-type': 'application/json', ...(request.headers ?? {}) };
  }
  return app.inject(new Request(url, init));
}
```

```ts
const res = await inject(app, {
  method: 'POST',
  url: '/cats',
  headers: { authorization: 'Bearer admin-token' },
  body: { name: 'Loki' },
});
```

## Testing the Nest pipeline end-to-end

`app.inject()` exercises the **same** pipeline as a real HTTP request: guards run, pipes transform, interceptors observe, exception filters convert errors, and `@RouteSchema` validates inputs before any of that.

| Behavior | How it surfaces in `inject()` |
|---|---|
| Auth guard rejects | `res.status === 401` |
| Roles guard mismatch | `res.status === 403` |
| Schema validation fails | `res.status === 422` with Elysia's structured error body |
| `ParseIntPipe` rejects param | `res.status === 400` |
| `HttpException` thrown in controller | Status from the exception, body from the exception payload |
| Native `Error` in controller | `res.status === 500` (Nest's default exception filter) |

## Testing WebSocket gateways

`app.inject()` does **not** support WebSocket upgrades — that requires a real TCP socket. For WS gateway tests, listen on port `0` (random ephemeral) and use Bun's built-in `WebSocket` client:

```ts
const app = await NestFactory.create<NestElysiaApplication>(WsModule, new ElysiaAdapter());
app.useWebSocketAdapter(new ElysiaWsAdapter(app));
await app.listen(0, '127.0.0.1');
const port = (app.getHttpAdapter().getInstance() as { server: { port: number } }).server.port;

const ws = new WebSocket(`ws://127.0.0.1:${port}/events`);
// ...
```
