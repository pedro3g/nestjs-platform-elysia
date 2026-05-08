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
