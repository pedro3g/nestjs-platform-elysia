import { afterEach, describe, expect, test } from 'bun:test';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Elysia } from 'elysia';
import { ElysiaAdapter, type NestElysiaApplication } from '../../src';
import { createApp } from '../helpers/create-app';

@Controller('hello')
class HelloController {
  @Get()
  hello() {
    return { hello: 'world' };
  }
}

@Module({ controllers: [HelloController] })
class HelloModule {}

describe('e2e: NestElysiaApplication public surface', () => {
  let app: NestElysiaApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  test('app.inject() works directly via Proxy (Test.createTestingModule)', async () => {
    app = await createApp({ modules: [HelloModule] });
    const res = await app.inject(new Request('http://localhost/hello'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  test('app.inject() works directly via Proxy (NestFactory.create)', async () => {
    app = await NestFactory.create<NestElysiaApplication>(HelloModule, new ElysiaAdapter(), {
      logger: false,
    });
    await app.init();
    const res = await app.inject(new Request('http://localhost/hello'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  test('app.register(plugin) forwards to Elysia.use()', async () => {
    app = await createApp({ modules: [HelloModule] });
    const sentinel = new Elysia().get('/native', () => ({ native: true }));
    app.register(sentinel);

    const res = await app.inject(new Request('http://localhost/native'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ native: true });
  });

  test('app.mount(path, handler) mounts a fetch handler', async () => {
    app = await createApp({ modules: [HelloModule] });
    app.mount('/raw', () => new Response('mounted', { status: 200 }));

    const res = await app.inject(new Request('http://localhost/raw'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('mounted');
  });

  test('app.getHttpAdapter() returns the ElysiaAdapter', async () => {
    app = await createApp({ modules: [HelloModule] });
    const adapter = app.getHttpAdapter();
    expect(adapter).toBeInstanceOf(ElysiaAdapter);
    expect(adapter.getType()).toBe('elysia');
  });

  test('adapter.getInstance() exposes the Elysia instance', async () => {
    app = await createApp({ modules: [HelloModule] });
    const elysia = app.getHttpAdapter().getInstance() as unknown as {
      handle: (req: Request) => Promise<Response>;
      route: unknown;
      use: unknown;
    };
    expect(typeof elysia.handle).toBe('function');
    expect(typeof elysia.route).toBe('function');
    expect(typeof elysia.use).toBe('function');
  });
});
