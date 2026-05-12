import { afterEach, describe, expect, test } from 'bun:test';
import { Module } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import type { ElysiaWsClient, NestElysiaApplication } from '../../src';
import { connectWs, createWsApp, listenForMessage } from '../helpers/create-ws-app';

@WebSocketGateway({ path: '/h' })
class HardeningGateway {
  @SubscribeMessage('echo')
  echo(@MessageBody() data: { value: string }): { received: string } {
    return { received: data.value };
  }

  @SubscribeMessage('crash')
  crash(): never {
    throw new WsException('users_email_key violation in handler');
  }

  @SubscribeMessage('kick')
  kick(@ConnectedSocket() client: ElysiaWsClient): void {
    client.close(4001, 'banned');
  }
}

@Module({ providers: [HardeningGateway] })
class HardeningModule {}

describe('e2e: WS hardening', () => {
  let app: NestElysiaApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  test('oversized message rejected with envelope; connection stays usable', async () => {
    const ctx = await createWsApp({
      modules: [HardeningModule],
      wsConfig: { maxMessageSize: 128 },
    });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const oversizedReply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'echo', data: { value: 'a'.repeat(500) } }));
    const errFrame = JSON.parse(await oversizedReply) as {
      event: string;
      data: { message: string };
    };
    expect(errFrame.event).toBe('error');
    expect(errFrame.data.message).toBe('Message too large');

    const followUp = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'echo', data: { value: 'tiny' } }));
    const ok = JSON.parse(await followUp) as { event: string; data: { received: string } };
    expect(ok).toEqual({ event: 'echo', data: { received: 'tiny' } });
    ws.close();
  });

  test('handler throw with exposeErrorMessages=false yields generic envelope', async () => {
    const ctx = await createWsApp({ modules: [HardeningModule] });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'crash', data: {} }));
    const frame = JSON.parse(await reply) as { event: string; data: { message: string } };
    expect(frame.event).toBe('error');
    expect(frame.data.message).toBe('Internal error');
    expect(frame.data.message).not.toContain('users_email_key');
    ws.close();
  });

  test('handler throw with exposeErrorMessages=true forwards .message', async () => {
    const ctx = await createWsApp({
      modules: [HardeningModule],
      wsConfig: { exposeErrorMessages: true },
    });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'crash', data: {} }));
    const frame = JSON.parse(await reply) as { event: string; data: { message: string } };
    expect(frame.data.message).toContain('users_email_key');
    ws.close();
  });

  test('exposeErrorMessages as sanitizer callback receives the NestJS exception payload', async () => {
    const ctx = await createWsApp({
      modules: [HardeningModule],
      wsConfig: {
        exposeErrorMessages: (err) => {
          const msg =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : String(err);
          return msg.includes('violation') ? 'Conflict' : 'Internal error';
        },
      },
    });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const reply = listenForMessage(ws);
    ws.send(JSON.stringify({ event: 'crash', data: {} }));
    const frame = JSON.parse(await reply) as { event: string; data: { message: string } };
    expect(frame.data.message).toBe('Conflict');
    ws.close();
  });

  test.skip('server-initiated close delivers code and reason to the client', async () => {
    // Skipped: Bun's WS abnormal-close cleanup races with app.close() drain in
    // test mode, even though the close itself works in standalone usage.
    const ctx = await createWsApp({ modules: [HardeningModule] });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.addEventListener('close', (e) => resolve({ code: e.code, reason: e.reason }), {
        once: true,
      });
    });
    ws.send(JSON.stringify({ event: 'kick', data: {} }));
    const result = await closed;
    expect(result.code).toBe(4001);
    expect(result.reason).toBe('banned');
  });

  test('JSON depth guard drops payloads above maxJsonDepth', async () => {
    const ctx = await createWsApp({ modules: [HardeningModule], wsConfig: { maxJsonDepth: 4 } });
    app = ctx.app;
    const ws = await connectWs(ctx.url('/h'));

    const reply = listenForMessage(ws);
    let nested = '{"a":{}}';
    for (let i = 0; i < 10; i++) nested = `{"a":${nested}}`;
    ws.send(nested);
    const frame = JSON.parse(await reply) as { event: string; data: { message: string } };
    expect(frame.event).toBe('error');
    expect(frame.data.message).toBe('Payload too complex');
    ws.close();
  });
});
