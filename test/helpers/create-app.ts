import type { LogLevel, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ElysiaAdapter, type NestElysiaApplication } from '../../src';

export interface CreateAppOptions {
  modules: Type<unknown>[];
  configure?: (app: NestElysiaApplication) => void | Promise<void>;
  adapterOptions?: ConstructorParameters<typeof ElysiaAdapter>[0];
  logger?: false | LogLevel[];
  rawBody?: boolean;
}

export async function createApp(options: CreateAppOptions): Promise<NestElysiaApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: options.modules,
  }).compile();

  const app = moduleRef.createNestApplication<NestElysiaApplication>(
    new ElysiaAdapter(options.adapterOptions),
    {
      logger: options.logger ?? false,
      rawBody: options.rawBody,
    },
  );

  if (options.configure) await options.configure(app);

  await app.init();
  return app;
}

export async function inject(
  app: NestElysiaApplication,
  request: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    contentType?: string;
  },
): Promise<Response> {
  const url = request.url.startsWith('http') ? request.url : `http://localhost${request.url}`;
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: request.headers,
  };
  if (request.body !== undefined) {
    const isString = typeof request.body === 'string';
    init.body = isString ? (request.body as string) : JSON.stringify(request.body);
    const callerContentType =
      request.headers &&
      Object.keys(request.headers).find((k) => k.toLowerCase() === 'content-type');
    if (!callerContentType) {
      const defaultCt = request.contentType ?? (isString ? undefined : 'application/json');
      if (defaultCt) {
        init.headers = { ...(request.headers ?? {}), 'content-type': defaultCt };
      }
    }
  }
  return app.inject(new Request(url, init));
}
