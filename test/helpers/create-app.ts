import type { INestApplication, LogLevel, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ElysiaAdapter, type NestElysiaApplication } from '../../src';

export interface CreateAppOptions {
  modules: Type<unknown>[];
  configure?: (app: NestElysiaApplication) => void | Promise<void>;
  adapterOptions?: ConstructorParameters<typeof ElysiaAdapter>[0];
  logger?: false | LogLevel[];
}

export async function createApp(options: CreateAppOptions): Promise<NestElysiaApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: options.modules,
  }).compile();

  const app = moduleRef.createNestApplication<NestElysiaApplication>(
    new ElysiaAdapter(options.adapterOptions),
    { logger: options.logger ?? false },
  );

  if (options.configure) await options.configure(app);

  await app.init();
  return app;
}

export async function inject(
  app: INestApplication,
  request: { method?: string; url: string; headers?: Record<string, string>; body?: unknown },
): Promise<Response> {
  const adapter = app.getHttpAdapter() as ElysiaAdapter;
  const url = request.url.startsWith('http') ? request.url : `http://localhost${request.url}`;
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: request.headers,
  };
  if (request.body !== undefined) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    init.headers = {
      'content-type': 'application/json',
      ...(request.headers ?? {}),
    };
  }
  return adapter.inject(new Request(url, init));
}
