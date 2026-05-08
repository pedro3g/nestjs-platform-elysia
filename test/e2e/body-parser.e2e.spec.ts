import { afterEach, describe, expect, test } from 'bun:test';
import { Body, Controller, Module, Post, Req } from '@nestjs/common';
import type { ElysiaRequest, NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('parse')
class ParseController {
  @Post('echo')
  echo(@Body() body: unknown, @Req() req: ElysiaRequest) {
    return {
      body,
      rawBody: req.rawBody ? req.rawBody.toString('utf-8') : null,
      rawBodyLength: req.rawBody ? req.rawBody.byteLength : null,
    };
  }
}

@Module({ controllers: [ParseController] })
class ParseModule {}

describe('e2e: useBodyParser / rawBody', () => {
  let app: NestElysiaApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  test('without rawBody: req.rawBody is undefined and body is parsed normally', async () => {
    app = await createApp({ modules: [ParseModule] });

    const res = await inject(app, {
      method: 'POST',
      url: '/parse/echo',
      body: { name: 'Mia' },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { body: { name: string }; rawBody: string | null };
    expect(json.body).toEqual({ name: 'Mia' });
    expect(json.rawBody).toBeNull();
  });

  test('NestApplicationOptions.rawBody: true captures rawBody for all parsed bodies', async () => {
    app = await createApp({ modules: [ParseModule], rawBody: true });

    const res = await inject(app, {
      method: 'POST',
      url: '/parse/echo',
      body: { name: 'Mia' },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      body: { name: string };
      rawBody: string | null;
      rawBodyLength: number | null;
    };
    expect(json.body).toEqual({ name: 'Mia' });
    expect(json.rawBody).toBe(JSON.stringify({ name: 'Mia' }));
    expect(json.rawBodyLength).toBe(JSON.stringify({ name: 'Mia' }).length);
  });

  test('global rawBody + useBodyParser narrows capture to listed content-types', async () => {
    app = await createApp({
      modules: [ParseModule],
      rawBody: true,
      configure: (a) => {
        a.useBodyParser('application/json');
      },
    });

    const jsonRes = await app.inject(
      new Request('http://localhost/parse/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x: 1 }),
      }),
    );
    const jsonOut = (await jsonRes.json()) as { body: unknown; rawBody: string | null };
    expect(jsonOut.body).toEqual({ x: 1 });
    expect(jsonOut.rawBody).toBe('{"x":1}');

    const formRes = await app.inject(
      new Request('http://localhost/parse/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'a=1',
      }),
    );
    const formOut = (await formRes.json()) as { body: unknown; rawBody: string | null };
    expect(formOut.body).toEqual({ a: '1' });
    expect(formOut.rawBody).toBeNull();
  });

  test('useBodyParser(type, undefined, options, parser) routes to a custom parser', async () => {
    app = await createApp({
      modules: [ParseModule],
      configure: (a) => {
        a.useBodyParser('application/x-protobuf', undefined, ({ rawBody }) => ({
          decoded: `protobuf:${rawBody.toString('utf-8')}`,
        }));
      },
    });

    const res = await app.inject(
      new Request('http://localhost/parse/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/x-protobuf' },
        body: 'binary-payload',
      }),
    );
    expect(res.status).toBe(201);
    const out = (await res.json()) as { body: { decoded: string }; rawBody: string | null };
    expect(out.body).toEqual({ decoded: 'protobuf:binary-payload' });
    expect(out.rawBody).toBe('binary-payload');
  });

  test('global rawBody captures urlencoded into a flat object', async () => {
    app = await createApp({ modules: [ParseModule], rawBody: true });

    const res = await app.inject(
      new Request('http://localhost/parse/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'name=Mia&age=3',
      }),
    );
    expect(res.status).toBe(201);
    const out = (await res.json()) as { body: Record<string, string>; rawBody: string | null };
    expect(out.body).toEqual({ name: 'Mia', age: '3' });
    expect(out.rawBody).toBe('name=Mia&age=3');
  });
});
