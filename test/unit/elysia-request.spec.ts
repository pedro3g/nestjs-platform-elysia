import { describe, expect, test } from 'bun:test';
import { ElysiaRequest } from '../../src/request/elysia-request';
import { createMockContext } from '../helpers/mock-context';

describe('ElysiaRequest', () => {
  test('exposes ctx body, query, params, headers, cookies', () => {
    const ctx = createMockContext({
      body: { name: 'Mia' },
      query: { search: 'cat' },
      params: { id: '7' },
      headers: { authorization: 'Bearer x' },
    });
    const req = new ElysiaRequest(ctx);
    expect(req.body).toEqual({ name: 'Mia' });
    expect(req.query).toEqual({ search: 'cat' });
    expect(req.params).toEqual({ id: '7' });
    expect(req.headers).toEqual({ authorization: 'Bearer x' });
  });

  test('method comes from raw request', () => {
    const req = new ElysiaRequest(createMockContext({ method: 'POST' }));
    expect(req.method).toBe('POST');
  });

  test('url and originalUrl include search', () => {
    const req = new ElysiaRequest(createMockContext({ url: 'http://localhost/cats?limit=10' }));
    expect(req.url).toBe('/cats?limit=10');
    expect(req.originalUrl).toBe('/cats?limit=10');
  });

  test('hostname and protocol come from raw url', () => {
    const req = new ElysiaRequest(createMockContext({ url: 'https://api.example.com/foo' }));
    expect(req.hostname).toBe('api.example.com');
    expect(req.protocol).toBe('https');
  });

  test('path uses ctx.path; route uses ctx.route', () => {
    const ctx = createMockContext({ path: '/cats/7', route: '/cats/:id' });
    const req = new ElysiaRequest(ctx);
    expect(req.path).toBe('/cats/7');
    expect(req.route).toBe('/cats/:id');
  });

  test('ip pulls from ctx.server.requestIP, undefined when unavailable', () => {
    expect(new ElysiaRequest(createMockContext({ ip: '10.0.0.1' })).ip).toBe('10.0.0.1');
    expect(new ElysiaRequest(createMockContext()).ip).toBeUndefined();
  });

  test('get(name) is case-insensitive', () => {
    const req = new ElysiaRequest(createMockContext({ headers: { 'x-trace-id': 'abc' } }));
    expect(req.get('X-Trace-Id')).toBe('abc');
    expect(req.header('x-trace-id')).toBe('abc');
    expect(req.get('Missing')).toBeUndefined();
  });

  test('raw and elysia escape hatches are exposed', () => {
    const ctx = createMockContext();
    const req = new ElysiaRequest(ctx);
    expect(req.raw).toBe(ctx.request);
    expect(req.elysia).toBe(ctx);
  });
});
