import type { Context } from 'elysia';

export interface MockContextOptions {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
  path?: string;
  route?: string;
  ip?: string;
}

export function createMockContext(opts: MockContextOptions = {}): Context {
  const url = opts.url ?? 'http://localhost/test';
  const request = new Request(url, { method: opts.method ?? 'GET', headers: opts.headers });
  return {
    request,
    body: opts.body,
    query: opts.query ?? {},
    params: opts.params ?? {},
    headers: opts.headers ?? {},
    cookie: {},
    path: opts.path ?? new URL(url).pathname,
    route: opts.route ?? '/',
    server: opts.ip ? { requestIP: () => ({ address: opts.ip!, family: 'IPv4', port: 0 }) } : null,
    set: { headers: {} as Record<string, string> },
    redirect: () => undefined,
    status: () => undefined,
    store: {},
  } as unknown as Context;
}
