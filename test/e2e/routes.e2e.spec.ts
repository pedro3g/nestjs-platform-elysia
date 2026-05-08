import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Module,
  Options,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('items')
class ItemsController {
  @Get()
  list(@Query('limit') limit?: string) {
    return { limit };
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return { id };
  }

  @Post()
  create(@Body() body: { name: string }) {
    return { created: body.name };
  }

  @Put(':id')
  replace(@Param('id') id: string, @Body() body: { name: string }) {
    return { id, name: body.name, replaced: true };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { id, ...body, patched: true };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return { removed: id };
  }

  @Head(':id')
  head() {
    return undefined;
  }

  @Options()
  opts() {
    return { allow: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' };
  }
}

@Module({ controllers: [ItemsController] })
class ItemsModule {}

describe('e2e: routes', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [ItemsModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('GET / returns 200 with query', async () => {
    const res = await inject(app, { url: '/items?limit=5' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ limit: '5' });
  });

  test('GET /:id returns 200 with param', async () => {
    const res = await inject(app, { url: '/items/42' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  test('POST returns 201 by default', async () => {
    const res = await inject(app, { method: 'POST', url: '/items', body: { name: 'foo' } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 'foo' });
  });

  test('PUT returns 200', async () => {
    const res = await inject(app, { method: 'PUT', url: '/items/7', body: { name: 'bar' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '7', name: 'bar', replaced: true });
  });

  test('PATCH merges body', async () => {
    const res = await inject(app, {
      method: 'PATCH',
      url: '/items/7',
      body: { description: 'desc' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '7', description: 'desc', patched: true });
  });

  test('DELETE returns 200 with payload', async () => {
    const res = await inject(app, { method: 'DELETE', url: '/items/9' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: '9' });
  });

  test('OPTIONS returns the allow set', async () => {
    const res = await inject(app, { method: 'OPTIONS', url: '/items' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allow: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' });
  });

  test('unknown route returns 404', async () => {
    const res = await inject(app, { url: '/no-such-route' });
    expect(res.status).toBe(404);
  });
});
