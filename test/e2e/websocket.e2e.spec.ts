import { afterEach, describe, expect, test } from 'bun:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { ElysiaAdapter, ElysiaWsAdapter, type NestElysiaApplication } from '../../src';

@WebSocketGateway({ path: '/events' })
class EventsGateway {
  @SubscribeMessage('echo')
  echo(@MessageBody() data: { value: string }): { received: string } {
    return { received: data.value };
  }

  @SubscribeMessage('compute')
  compute(@MessageBody() data: { a: number; b: number }) {
    return { event: 'computed', data: { sum: data.a + data.b } };
  }
}

@Module({ providers: [EventsGateway] })
class WsModule {}

async function bootstrapWs(): Promise<{ app: NestElysiaApplication; port: number }> {
  const app = await NestFactory.create<NestElysiaApplication>(WsModule, new ElysiaAdapter(), {
    logger: false,
  });
  app.useWebSocketAdapter(new ElysiaWsAdapter(app));
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpAdapter().getInstance() as { server?: { port: number } }).server?.port;
  if (!port) throw new Error('failed to bind WS port');
  return { app, port };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', (e) => reject(e), { once: true });
  });
}

function listenForMessage(ws: WebSocket, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.onmessage = null;
      reject(new Error('ws message timeout'));
    }, timeoutMs);
    ws.onmessage = (e) => {
      clearTimeout(timer);
      ws.onmessage = null;
      resolve(
        typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer),
      );
    };
  });
}

describe('e2e: WebSocket gateways', () => {
  let app: NestElysiaApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  test('@SubscribeMessage handler echoes a value back wrapped with the original event', async () => {
    const ctx = await bootstrapWs();
    app = ctx.app;
    const ws = await connect(`ws://127.0.0.1:${ctx.port}/events`);
    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'echo', data: { value: 'ping' } }));
    const raw = await reply;
    ws.close();

    const message = JSON.parse(raw) as { event: string; data: unknown };
    expect(message).toEqual({ event: 'echo', data: { received: 'ping' } });
  });

  test('handler returning a {event,data} envelope keeps the explicit event name', async () => {
    const ctx = await bootstrapWs();
    app = ctx.app;
    const ws = await connect(`ws://127.0.0.1:${ctx.port}/events`);
    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'compute', data: { a: 2, b: 3 } }));
    const raw = await reply;
    ws.close();

    const message = JSON.parse(raw) as { event: string; data: unknown };
    expect(message).toEqual({ event: 'computed', data: { sum: 5 } });
  });

  test('unknown events are silently ignored (no response, connection stays open)', async () => {
    const ctx = await bootstrapWs();
    app = ctx.app;
    const ws = await connect(`ws://127.0.0.1:${ctx.port}/events`);

    ws.send(JSON.stringify({ event: 'no-such-event', data: {} }));
    await new Promise((r) => setTimeout(r, 100));

    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'echo', data: { value: 'still alive' } }));
    const raw = await reply;
    ws.close();

    const message = JSON.parse(raw) as { event: string; data: unknown };
    expect(message).toEqual({ event: 'echo', data: { received: 'still alive' } });
  });
});
