import { describe, expect, test } from 'bun:test';
import { ElysiaReply } from '../../src/reply/elysia-reply';
import { createMockContext } from '../helpers/mock-context';

describe('ElysiaReply', () => {
  test('default statusCode is 200 and not sent', () => {
    const reply = new ElysiaReply(createMockContext());
    expect(reply.statusCode).toBe(200);
    expect(reply.sent).toBe(false);
  });

  test('status() updates statusCode and ctx.set.status, returns this', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    const result = reply.status(404);
    expect(result).toBe(reply);
    expect(reply.statusCode).toBe(404);
    expect(ctx.set.status).toBe(404);
  });

  test('code() is a status alias', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.code(201);
    expect(reply.statusCode).toBe(201);
    expect(ctx.set.status).toBe(201);
  });

  test('header() lowercases name and stringifies value', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.header('X-Trace-Id', 'abc123').header('Cache-Control', 'no-store');
    expect((ctx.set.headers as Record<string, string>)['x-trace-id']).toBe('abc123');
    expect((ctx.set.headers as Record<string, string>)['cache-control']).toBe('no-store');
  });

  test('header() with array on combinable header joins with comma', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.header('Vary', ['Origin', 'Accept']);
    expect((ctx.set.headers as Record<string, string>).vary).toBe('Origin, Accept');
  });

  test('header() with array on Set-Cookie stays as array (multi-value)', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.header('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
    expect((ctx.set.headers as Record<string, string | string[]>)['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
  });

  test('appendHeader() on Set-Cookie accumulates as array, never joins', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.appendHeader('Set-Cookie', 'a=1; Path=/');
    reply.appendHeader('Set-Cookie', 'b=2; Path=/');
    reply.appendHeader('Set-Cookie', ['c=3; Path=/', 'd=4; Path=/']);
    expect((ctx.set.headers as Record<string, string | string[]>)['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
      'c=3; Path=/',
      'd=4; Path=/',
    ]);
  });

  test('appendHeader() on combinable header keeps the comma-join behavior', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.appendHeader('Cache-Control', 'no-store');
    reply.appendHeader('Cache-Control', 'no-cache');
    expect((ctx.set.headers as Record<string, string>)['cache-control']).toBe('no-store, no-cache');
  });

  test('getHeader / hasHeader / removeHeader / appendHeader', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.header('x-test', 'one');
    expect(reply.getHeader('X-Test')).toBe('one');
    expect(reply.hasHeader('X-Test')).toBe(true);
    reply.appendHeader('X-Test', 'two');
    expect(reply.getHeader('x-test')).toBe('one, two');
    reply.removeHeader('x-test');
    expect(reply.hasHeader('x-test')).toBe(false);
    expect(reply.getHeader('x-test')).toBeUndefined();
  });

  test('type() sets content-type', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.type('text/plain');
    expect(reply.getHeader('content-type')).toBe('text/plain');
  });

  test('send() marks sent and stores body in _toResponse', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.send({ ok: true });
    expect(reply.sent).toBe(true);
    expect(reply._toResponse()).toEqual({ ok: true });
  });

  test('json() sets content-type to application/json', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.json({ x: 1 });
    expect(reply.getHeader('content-type')).toBe('application/json');
    expect(reply._toResponse()).toEqual({ x: 1 });
  });

  test('redirect(url) defaults to 302', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.redirect('/login');
    expect(reply.sent).toBe(true);
    expect(reply.statusCode).toBe(302);
    expect((ctx.set.headers as Record<string, string>).location).toBe('/login');
    const response = reply._toResponse() as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('redirect(status, url) honors status', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.redirect(301, '/new');
    expect(reply.statusCode).toBe(301);
    const response = reply._toResponse() as Response;
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/new');
  });

  test('stream() yields a Response with the stream and headers', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.header('content-type', 'text/event-stream');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hi\n\n'));
        controller.close();
      },
    });
    reply.stream(stream);
    const response = reply._toResponse() as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  test('end() is a send alias', () => {
    const reply = new ElysiaReply(createMockContext());
    reply.end('done');
    expect(reply.sent).toBe(true);
    expect(reply._toResponse()).toBe('done');
  });

  test('statusCode setter delegates to status()', () => {
    const ctx = createMockContext();
    const reply = new ElysiaReply(ctx);
    reply.statusCode = 418;
    expect(reply.statusCode).toBe(418);
    expect(ctx.set.status).toBe(418);
  });
});
