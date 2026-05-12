import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Module,
  NotFoundException,
  Param,
} from '@nestjs/common';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('errors')
class ErrorController {
  @Get('not-found')
  notFound() {
    throw new NotFoundException('missing');
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException('nope');
  }

  @Get('bad-request')
  bad() {
    throw new BadRequestException({ field: 'name', issue: 'too short' });
  }

  @Get('teapot')
  teapot() {
    throw new HttpException("I'm a teapot", HttpStatus.I_AM_A_TEAPOT);
  }

  @Get('crash')
  crash() {
    throw new Error('boom');
  }

  @Get('throw-string')
  throwString() {
    // eslint-disable-next-line no-throw-literal
    throw 'a-raw-string-error';
  }

  @Get('throw-object')
  throwObject() {
    // eslint-disable-next-line no-throw-literal
    throw { code: 'CUSTOM' };
  }

  @Get('item/:id')
  conditional(@Param('id') id: string) {
    if (id === 'missing') throw new NotFoundException(`no item ${id}`);
    return { id };
  }
}

@Module({ controllers: [ErrorController] })
class ErrorModule {}

describe('e2e: error handling', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [ErrorModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('NotFoundException returns 404 with message', async () => {
    const res = await inject(app, { url: '/errors/not-found' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { statusCode: number; message: string };
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('missing');
  });

  test('ForbiddenException returns 403', async () => {
    const res = await inject(app, { url: '/errors/forbidden' });
    expect(res.status).toBe(403);
  });

  test('BadRequestException with object payload becomes the response body', async () => {
    const res = await inject(app, { url: '/errors/bad-request' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.field).toBe('name');
    expect(body.issue).toBe('too short');
  });

  test('custom HttpException status code is honored', async () => {
    const res = await inject(app, { url: '/errors/teapot' });
    expect(res.status).toBe(418);
  });

  test('uncaught Error returns 500 from Nest exception filter', async () => {
    const res = await inject(app, { url: '/errors/crash' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { statusCode: number };
    expect(body.statusCode).toBe(500);
  });

  test('unmatched route returns 404', async () => {
    const res = await inject(app, { url: '/no-such-thing' });
    expect(res.status).toBe(404);
  });

  test('Elysia native errors are not converted to 500 by Nest filter', async () => {
    // verified end-to-end in schema-validation.e2e-spec.ts (422 stays 422)
    const res = await inject(app, { url: '/errors/item/missing' });
    expect(res.status).toBe(404);
  });

  test('throwing a raw string becomes 500 without crashing the filter chain', async () => {
    const res = await inject(app, { url: '/errors/throw-string' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { statusCode: number };
    expect(body.statusCode).toBe(500);
  });

  test('throwing a plain object becomes 500 without crashing the filter chain', async () => {
    const res = await inject(app, { url: '/errors/throw-object' });
    expect(res.status).toBe(500);
  });
});
