import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  Controller,
  Get,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import type { NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

interface MwReq {
  headers: Record<string, string | undefined>;
  middlewareTrace?: string[];
}
interface MwRes {
  status: (code: number) => MwRes;
  send: (body: unknown) => MwRes;
}
type Next = () => void;

@Injectable()
class TraceMiddleware implements NestMiddleware {
  use(req: MwReq, _res: MwRes, next: Next) {
    req.middlewareTrace = [...(req.middlewareTrace ?? []), 'trace'];
    next();
  }
}

@Injectable()
class GateMiddleware implements NestMiddleware {
  use(req: MwReq, res: MwRes, next: Next) {
    if (req.headers['x-blocked'] === '1') {
      res.status(403).send({ blocked: true });
      return;
    }
    next();
  }
}

@Controller('mw')
class MwController {
  @Get('hit')
  hit() {
    return { hit: true };
  }

  @Get('skip')
  skip() {
    return { skip: true };
  }
}

@Module({ controllers: [MwController], providers: [TraceMiddleware, GateMiddleware] })
class MwModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TraceMiddleware)
      .forRoutes({ path: 'mw/hit', method: RequestMethod.GET })
      .apply(GateMiddleware)
      .forRoutes('mw/(.*)');
  }
}

describe('e2e: middleware', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [MwModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('middleware that calls next() lets the route handler run', async () => {
    const res = await inject(app, { url: '/mw/hit' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hit: true });
  });

  test('middleware can short-circuit by sending a response', async () => {
    const res = await inject(app, { url: '/mw/hit', headers: { 'x-blocked': '1' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ blocked: true });
  });

  test('non-matching routes skip the middleware that did not register them', async () => {
    const res = await inject(app, { url: '/mw/skip' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skip: true });
  });
});
