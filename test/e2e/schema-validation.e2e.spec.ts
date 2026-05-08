import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { t } from 'elysia';
import { type NestElysiaApplication, RouteSchema } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('typed')
class TypedController {
  @Post()
  @RouteSchema({
    body: t.Object({
      name: t.String({ minLength: 1 }),
      age: t.Number({ minimum: 0 }),
    }),
  })
  create(@Body() body: { name: string; age: number }) {
    return { received: body };
  }

  @Get('search')
  @RouteSchema({
    query: t.Object({
      q: t.String({ minLength: 2 }),
    }),
  })
  search(@Query() query: { q: string }) {
    return { q: query.q };
  }
}

@Module({ controllers: [TypedController] })
class TypedModule {}

describe('e2e: @RouteSchema TypeBox validation', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [TypedModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('valid body passes through to controller', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/typed',
      body: { name: 'Mia', age: 3 },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: { name: 'Mia', age: 3 } });
  });

  test('invalid body returns 422 with Elysia validation details', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/typed',
      body: { name: '', age: -1 },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      type: string;
      on: string;
      errors: Array<{ path: string; message: string }>;
    };
    expect(body.type).toBe('validation');
    expect(body.on).toBe('body');
    expect(body.errors.some((e) => e.path === '/name')).toBe(true);
  });

  test('missing required field also returns 422', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/typed',
      body: { age: 3 },
    });
    expect(res.status).toBe(422);
  });

  test('valid query passes through', async () => {
    const res = await inject(app, { url: '/typed/search?q=cat' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'cat' });
  });

  test('invalid query returns 422', async () => {
    const res = await inject(app, { url: '/typed/search?q=a' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { type: string; on: string };
    expect(body.type).toBe('validation');
    expect(body.on).toBe('query');
  });
});
