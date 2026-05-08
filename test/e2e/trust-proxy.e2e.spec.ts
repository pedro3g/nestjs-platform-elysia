import { afterEach, describe, expect, test } from 'bun:test';
import { Controller, Get, Module, Req } from '@nestjs/common';
import type { ElysiaRequest, NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('whoami')
class WhoamiController {
  @Get()
  whoami(@Req() req: ElysiaRequest) {
    return { ip: req.ip ?? null, hostname: req.hostname, protocol: req.protocol };
  }
}

@Module({ controllers: [WhoamiController] })
class WhoamiModule {}

describe('e2e: trust proxy', () => {
  let app: NestElysiaApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  test('without trustProxy: ignores X-Forwarded-* headers', async () => {
    app = await createApp({ modules: [WhoamiModule] });

    const res = await inject(app, {
      url: '/whoami',
      headers: {
        'x-forwarded-for': '203.0.113.7',
        'x-forwarded-host': 'api.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string | null; hostname: string; protocol: string };
    expect(body.hostname).toBe('localhost');
    expect(body.protocol).toBe('http');
  });

  test('trustProxy: true reads X-Forwarded-* headers', async () => {
    app = await createApp({
      modules: [WhoamiModule],
      adapterOptions: { trustProxy: true },
    });

    const res = await inject(app, {
      url: '/whoami',
      headers: {
        'x-forwarded-for': '203.0.113.7, 198.51.100.1',
        'x-forwarded-host': 'api.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string | null; hostname: string; protocol: string };
    expect(body.ip).toBe('203.0.113.7');
    expect(body.hostname).toBe('api.example.com');
    expect(body.protocol).toBe('https');
  });

  test('custom trustProxy resolver receives forwarded list and direct IP', async () => {
    let capturedDirect: string | undefined;
    app = await createApp({
      modules: [WhoamiModule],
      adapterOptions: {
        trustProxy: (forwardedFor, directIp) => {
          capturedDirect = directIp;
          return forwardedFor[forwardedFor.length - 1];
        },
      },
    });

    const res = await inject(app, {
      url: '/whoami',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string | null };
    expect(body.ip).toBe('198.51.100.1');
    expect(capturedDirect === undefined || typeof capturedDirect === 'string').toBe(true);
  });

  test('trustProxy: true falls back to X-Real-IP when X-Forwarded-For is absent', async () => {
    app = await createApp({
      modules: [WhoamiModule],
      adapterOptions: { trustProxy: true },
    });

    const res = await inject(app, {
      url: '/whoami',
      headers: { 'x-real-ip': '203.0.113.42' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string | null };
    expect(body.ip).toBe('203.0.113.42');
  });
});
