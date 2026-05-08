import { afterEach, describe, expect, test } from 'bun:test';
import { Controller, Get, Module } from '@nestjs/common';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('public')
class PublicController {
  @Get()
  hello() {
    return { hello: 'world' };
  }
}

@Module({ controllers: [PublicController] })
class PublicModule {}

describe('e2e: CORS', () => {
  let app: NestElysiaApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  test('default enableCors() allows any origin', async () => {
    app = await createApp({
      modules: [PublicModule],
      configure: (a) => {
        a.enableCors();
      },
    });

    const res = await inject(app, {
      url: '/public',
      headers: { origin: 'https://app.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  test('preflight OPTIONS returns CORS headers', async () => {
    app = await createApp({
      modules: [PublicModule],
      configure: (a) => {
        a.enableCors({ origin: 'https://app.example.com', methods: ['GET', 'POST'] });
      },
    });

    const res = await inject(app, {
      method: 'OPTIONS',
      url: '/public',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    const allowedMethods = res.headers.get('access-control-allow-methods');
    expect(allowedMethods).toContain('GET');
  });

  test('non-CORS requests still succeed', async () => {
    app = await createApp({
      modules: [PublicModule],
      configure: (a) => {
        a.enableCors();
      },
    });

    const res = await inject(app, { url: '/public' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });
});
