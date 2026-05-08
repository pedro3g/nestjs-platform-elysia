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

describe('ElysiaRequest with trustProxy', () => {
  test('without trustProxy: ip is the direct connection IP, X-Forwarded-For ignored', () => {
    const ctx = createMockContext({
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    });
    const req = new ElysiaRequest(ctx);
    expect(req.ip).toBe('10.0.0.1');
  });

  test('with trustProxy=true: ip resolves to leftmost X-Forwarded-For', () => {
    const ctx = createMockContext({
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    });
    const req = new ElysiaRequest(ctx, {
      trustProxy: (xff) => xff[0],
    });
    expect(req.ip).toBe('203.0.113.7');
  });

  test('with trustProxy + custom resolver: uses returned value', () => {
    const ctx = createMockContext({
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    });
    const req = new ElysiaRequest(ctx, {
      trustProxy: (xff) => xff[xff.length - 1],
    });
    expect(req.ip).toBe('198.51.100.1');
  });

  test('with trustProxy: falls back to X-Real-IP when no X-Forwarded-For', () => {
    const ctx = createMockContext({
      ip: '10.0.0.1',
      headers: { 'x-real-ip': '203.0.113.7' },
    });
    const req = new ElysiaRequest(ctx, { trustProxy: (xff) => xff[0] });
    expect(req.ip).toBe('203.0.113.7');
  });

  test('with trustProxy: falls back to direct IP when no proxy headers', () => {
    const ctx = createMockContext({ ip: '10.0.0.1' });
    const req = new ElysiaRequest(ctx, { trustProxy: (xff) => xff[0] });
    expect(req.ip).toBe('10.0.0.1');
  });

  test('with trustProxy: hostname comes from X-Forwarded-Host', () => {
    const ctx = createMockContext({
      url: 'http://internal-proxy:8080/foo',
      headers: { 'x-forwarded-host': 'api.example.com' },
    });
    const req = new ElysiaRequest(ctx, { trustProxy: (xff) => xff[0] });
    expect(req.hostname).toBe('api.example.com');
  });

  test('with trustProxy: protocol comes from X-Forwarded-Proto', () => {
    const ctx = createMockContext({
      url: 'http://internal-proxy:8080/foo',
      headers: { 'x-forwarded-proto': 'https' },
    });
    const req = new ElysiaRequest(ctx, { trustProxy: (xff) => xff[0] });
    expect(req.protocol).toBe('https');
  });

  test('without trustProxy: hostname and protocol come from raw URL', () => {
    const ctx = createMockContext({
      url: 'http://internal-proxy:8080/foo',
      headers: {
        'x-forwarded-host': 'api.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    const req = new ElysiaRequest(ctx);
    expect(req.hostname).toBe('internal-proxy');
    expect(req.protocol).toBe('http');
  });

  test('X-Forwarded-Host with multiple values takes the leftmost', () => {
    const ctx = createMockContext({
      url: 'http://proxy/foo',
      headers: { 'x-forwarded-host': 'api.example.com, edge.example.com' },
    });
    const req = new ElysiaRequest(ctx, { trustProxy: (xff) => xff[0] });
    expect(req.hostname).toBe('api.example.com');
  });
});
