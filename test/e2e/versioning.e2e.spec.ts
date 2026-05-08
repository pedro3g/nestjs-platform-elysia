import { afterEach, describe, expect, test } from 'bun:test';
import { Controller, Get, Module, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller({ path: 'data', version: '1' })
class V1Controller {
  @Get()
  list() {
    return { version: '1' };
  }
}

@Controller({ path: 'data', version: '2' })
class V2Controller {
  @Get()
  list() {
    return { version: '2' };
  }
}

@Controller({ path: 'data', version: VERSION_NEUTRAL })
class NeutralController {
  @Get('neutral')
  neutral() {
    return { version: 'neutral' };
  }
}

@Module({ controllers: [V1Controller, V2Controller, NeutralController] })
class VersionedModule {}

describe('e2e: versioning', () => {
  let app: NestElysiaApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  test('URI versioning: /v1/data and /v2/data resolve to different controllers', async () => {
    app = await createApp({
      modules: [VersionedModule],
      configure: (a) => {
        a.enableVersioning({ type: VersioningType.URI });
      },
    });

    const r1 = await inject(app, { url: '/v1/data' });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ version: '1' });

    const r2 = await inject(app, { url: '/v2/data' });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ version: '2' });
  });

  test('URI versioning: VERSION_NEUTRAL routes match without prefix', async () => {
    app = await createApp({
      modules: [VersionedModule],
      configure: (a) => {
        a.enableVersioning({ type: VersioningType.URI });
      },
    });

    const r = await inject(app, { url: '/data/neutral' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 'neutral' });
  });

  test('HEADER versioning: dispatches by custom header', async () => {
    app = await createApp({
      modules: [VersionedModule],
      configure: (a) => {
        a.enableVersioning({ type: VersioningType.HEADER, header: 'X-API-Version' });
      },
    });

    const r1 = await inject(app, { url: '/data', headers: { 'x-api-version': '1' } });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ version: '1' });

    const r2 = await inject(app, { url: '/data', headers: { 'x-api-version': '2' } });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ version: '2' });
  });

  test('MEDIA_TYPE versioning: dispatches by Accept header parameter', async () => {
    app = await createApp({
      modules: [VersionedModule],
      configure: (a) => {
        a.enableVersioning({ type: VersioningType.MEDIA_TYPE, key: 'v=' });
      },
    });

    const r1 = await inject(app, {
      url: '/data',
      headers: { accept: 'application/json;v=1' },
    });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ version: '1' });

    const r2 = await inject(app, {
      url: '/data',
      headers: { accept: 'application/json;v=2' },
    });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ version: '2' });
  });
});
