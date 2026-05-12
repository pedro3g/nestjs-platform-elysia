---
title: Body Parsing & rawBody
description: Capture raw request buffers for webhook signature verification, or register custom parsers for content-types Elysia doesn't know.
sidebar:
  order: 3
---

Elysia parses request bodies automatically based on `content-type`, so the common case needs no setup. This guide covers the two scenarios that do:

1. **Capturing the raw body** for webhooks that verify signatures against the exact bytes (Stripe, GitHub, Slack, etc.).
2. **Registering a custom parser** for a content-type Elysia doesn't handle natively (protobuf, msgpack, custom MIME types).

## Capture the raw body

Set `rawBody: true` in the NestApplication options. After that, every parsed request also has its raw bytes attached to `request.rawBody`.

```ts
const app = await NestFactory.create<NestElysiaApplication>(
  AppModule,
  new ElysiaAdapter(),
  { rawBody: true },
);
```

Then read it inside controllers, guards, or interceptors:

```ts
import { Controller, Post, Req } from '@nestjs/common';
import type { ElysiaRequest } from 'nestjs-platform-elysia';

@Controller('webhooks')
export class WebhooksController {
  @Post('stripe')
  stripe(@Req() req: ElysiaRequest) {
    const sig = req.get('stripe-signature');
    const verified = verifyStripe(req.rawBody!, sig);
    // ...
  }
}
```

`req.rawBody` is a `Buffer` (or `undefined` if `rawBody: true` wasn't set).

## Narrow which content-types capture the raw body

By default, the global `rawBody: true` flag captures the raw bytes for **every** parsed request. To limit it to specific content-types, call `app.useBodyParser(type)` for each one you want kept:

```ts
app.useBodyParser('application/json');
```

After at least one `useBodyParser()` call, capture is **only** done for the listed types — other parsed bodies (urlencoded, plain text) won't have `rawBody` set.

:::note[Nest convention]
NestJS auto-injects the global `rawBody` flag as the second argument when forwarding `useBodyParser()` to the adapter. That's why the user-facing API only takes `(type, options?, parser?)` — the `rawBody` part is wired via `NestFactory.create`'s options.
:::

## Custom parser for unknown content-types

Pass a parser function to handle a content-type Elysia doesn't recognize. The parser receives the raw `Buffer`, the content-type string, and the `Request` object, and returns whatever Elysia should expose as `ctx.body` (and Nest as `@Body()`).

```ts
import { decode as decodeProtobuf } from 'protobufjs';

app.useBodyParser(
  'application/x-protobuf',
  undefined,
  ({ rawBody, contentType, request }) => decodeProtobuf(rawBody),
);
```

You can register multiple custom parsers — one per content-type. Combined with `rawBody: true`, the raw buffer is also attached to `request.rawBody` so a downstream guard or interceptor can re-verify the bytes.

## Aliases

`useBodyParser(type)` accepts these shorthand aliases (mapped to canonical MIME types):

| Alias | MIME type |
|---|---|
| `json` | `application/json` |
| `urlencoded` | `application/x-www-form-urlencoded` |
| `text` | `text/plain` |
| `raw` | `application/octet-stream` |

## Body size limits

The adapter enforces a global body size limit via `bodyLimit` in the adapter options. The check runs on every request — not only on raw-body or custom-parser paths.

```ts
const app = await NestFactory.create<NestElysiaApplication>(
  AppModule,
  new ElysiaAdapter({ bodyLimit: 5 * 1024 * 1024 }), // 5 MiB
);
```

Enforcement happens in two layers:

1. **Pre-parse Content-Length check.** Requests with a `Content-Length` header above the limit are rejected with `413 Payload Too Large` before the body is read.
2. **Streaming guard on raw/custom parser paths.** When the body is buffered for `rawBody`/`useBodyParser`, the adapter aborts the read as soon as the cumulative byte count exceeds the limit, even if the client lied about Content-Length or used chunked transfer-encoding.

Defaults to **1 MiB**. Set `bodyLimit: 0` to disable the check.

### Per-content-type overrides

Override the global limit for a specific content-type via `useBodyParser`:

```ts
app.useBodyParser('application/json', { bodyLimit: 32 * 1024 });   // 32 KiB for JSON
app.useBodyParser('application/octet-stream', { bodyLimit: 50 * 1024 * 1024 }); // 50 MiB for raw uploads
```

The per-type limit applies before the global limit when the request's content-type matches.

:::caution[Production reverse proxies]
A real HTTP client (browser, curl, fetch) always sends `Content-Length` for fixed-size bodies, so the pre-parse check catches the most common DoS vectors. For chunked uploads without `Content-Length`, configure your reverse proxy (nginx `client_max_body_size`, Cloudflare upload limits) as the first line of defense, and rely on the adapter's streaming guard when you opt into `rawBody`/custom parsers.
:::
