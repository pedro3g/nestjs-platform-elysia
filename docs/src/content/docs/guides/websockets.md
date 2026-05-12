---
title: WebSocket Gateways
description: Bridge @WebSocketGateway and @SubscribeMessage onto Elysia's native WebSocket — same Bun server, no second port.
sidebar:
  order: 5
---

`ElysiaWsAdapter` bridges NestJS's WebSocket gateway pattern onto Elysia's native `app.ws(path, ...)` — running on the **same** Bun server as your HTTP routes (no second port, no `ws` library, no socket.io).

## Setup

Install the optional Nest peer dep:

```bash
bun add @nestjs/websockets
```

Wire the adapter before `app.listen()`:

```ts title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import {
  ElysiaAdapter,
  ElysiaWsAdapter,
  type NestElysiaApplication,
} from 'nestjs-platform-elysia';

const app = await NestFactory.create<NestElysiaApplication>(AppModule, new ElysiaAdapter());
app.useWebSocketAdapter(new ElysiaWsAdapter(app));
await app.listen(3000);
```

## A minimal gateway

```ts title="src/events/events.gateway.ts"
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ path: '/events' })
export class EventsGateway {
  @SubscribeMessage('echo')
  echo(@MessageBody() data: { value: string }) {
    return { received: data.value };
  }

  @SubscribeMessage('compute')
  compute(@MessageBody() data: { a: number; b: number }) {
    return { event: 'computed', data: { sum: data.a + data.b } };
  }
}
```

## Wire format

Clients send and receive JSON envelopes:

```json
{ "event": "<name>", "data": <payload> }
```

A handler return value is wrapped back into the inbound `event` automatically:

```ts
@SubscribeMessage('echo')
echo(@MessageBody() data: { value: string }) {
  return { received: data.value };
}

// Client sends: {"event":"echo","data":{"value":"ping"}}
// Client receives: {"event":"echo","data":{"received":"ping"}}
```

To respond with a different event name, return an explicit envelope:

```ts
@SubscribeMessage('compute')
compute(@MessageBody() data: { a: number; b: number }) {
  return { event: 'computed', data: { sum: data.a + data.b } };
}

// Client sends: {"event":"compute","data":{"a":2,"b":3}}
// Client receives: {"event":"computed","data":{"sum":5}}
```

## Async, Promise, Observable

Handlers can return any of:

- A plain value (wrapped synchronously)
- A `Promise<value>` (awaited and wrapped)
- An `Observable<value>` (each emission sent as a separate frame)

```ts
@SubscribeMessage('counter')
counter() {
  return interval(1000).pipe(map((n) => ({ tick: n })));
  // Emits { event: 'counter', data: { tick: 0 } }, { event: 'counter', data: { tick: 1 } }, ...
}
```

## Multiple gateways

Each `@WebSocketGateway({ path })` registers its own Elysia route. They live on the same Bun server, share the same HTTP port, but have independent connection tracking and message handlers.

```ts
@WebSocketGateway({ path: '/admin' })  export class AdminGateway { /* ... */ }

@WebSocketGateway({ path: '/public' }) export class PublicGateway { /* ... */ }
```

## Lifecycle hooks

The standard Nest interfaces work:

- `OnGatewayInit` — fires after the gateway is wired
- `OnGatewayConnection` — fires per client `open`
- `OnGatewayDisconnect` — fires per client `close`

```ts
@WebSocketGateway({ path: '/events' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: ElysiaWsClient) {
    console.log('client connected');
  }

  handleDisconnect(client: ElysiaWsClient) {
    console.log('client disconnected');
  }
}
```

## Direct send

For broadcasts, side-effects, or replies that don't fit the request/response model, send directly via the client object:

```ts
@SubscribeMessage('subscribe')
subscribe(@MessageBody() data: unknown, @ConnectedSocket() client: ElysiaWsClient) {
  client.send(JSON.stringify({ event: 'welcome', data: { ts: Date.now() } }));
  // Don't return — direct send, no envelope wrapping.
}
```

## Hardening

`ElysiaWsAdapter` accepts a config object with security-relevant defaults:

```ts
app.useWebSocketAdapter(
  new ElysiaWsAdapter(app, {
    maxMessageSize: 256 * 1024,   // bytes — also forwarded to Bun's `maxPayloadLength`
    maxJsonDepth: 32,             // JSON nesting cap to prevent parse-cost DoS
    maxJsonKeys: 1024,            // total key cap across the payload
    exposeErrorMessages: false,   // do NOT forward `err.message` to clients
  }),
);
```

### `maxMessageSize`

Default: **1 MiB**. Set to `0` to disable. The limit is enforced in two layers:

1. **Bun protocol layer** — `maxPayloadLength` is forwarded to Bun's WebSocket layer, so oversized frames are rejected before the handler is invoked. This is the load-bearing defense.
2. **Adapter layer** — a precise UTF-8 byte-count check inside `bindMessageHandlers` rejects oversize text frames that somehow slip past, replying with `{ event: 'error', data: { message: 'Message too large' } }` and keeping the connection open.

### `maxJsonDepth` and `maxJsonKeys`

JSON parsing has a cost amplification problem: a 900 KB payload of `{"a":{"a":...}}` can blow the V8 stack, and a payload with 200k keys can stall the event loop for seconds — both *under* `maxMessageSize`.

`maxJsonDepth` (default `32`) and `maxJsonKeys` (default `1024`) are linear-time pre-checks scanned against the raw text *before* `JSON.parse` runs. Violating payloads are dropped with `{ event: 'error', data: { message: 'Payload too complex' } }`.

### `exposeErrorMessages`

- `false` (default): clients receive a generic `"Internal error"` when a handler throws.
- `true`: the raw `err.message` is forwarded. **Only safe** when every handler error is intentionally user-facing. ORM errors, for example, routinely include SQL fragments, table names, and file paths in `.message`.
- `(err) => string`: a sanitizer callback. Return a safe per-error message:

```ts
new ElysiaWsAdapter(app, {
  exposeErrorMessages: (err) =>
    err instanceof UserFacingError ? err.message : 'Internal error',
});
```

Handler exceptions are also fully wrapped in a `try/catch` — a thrown guard/pipe/interceptor or async rejection inside `handler.callback` is caught, logged via Nest's `Logger`, and surfaced through the configured sanitizer.
