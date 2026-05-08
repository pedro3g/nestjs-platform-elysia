import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Controller, Get, Module, Res, StreamableFile } from '@nestjs/common';
import type { ElysiaReply, NestElysiaApplication } from '../../src';
import { createApp, inject } from '../helpers/create-app';

@Controller('files')
class FilesController {
  @Get('text')
  text(): StreamableFile {
    const buffer = Buffer.from('Hello, world!');
    return new StreamableFile(buffer, {
      type: 'text/plain',
      disposition: 'attachment; filename="greeting.txt"',
    });
  }

  @Get('binary')
  binary(): StreamableFile {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('with-length')
  withLength(): StreamableFile {
    const buffer = Buffer.from('counted');
    return new StreamableFile(buffer, { type: 'text/plain', length: buffer.byteLength });
  }
}

@Controller('cookies')
class CookiesController {
  @Get('multi')
  multi(@Res({ passthrough: true }) res: ElysiaReply): { ok: true } {
    res.appendHeader('Set-Cookie', 'session=abc; Path=/; HttpOnly');
    res.appendHeader('Set-Cookie', 'theme=dark; Path=/');
    res.appendHeader('Set-Cookie', 'tracking=xyz; Path=/; SameSite=Lax');
    return { ok: true };
  }

  @Get('header-array')
  headerArray(@Res({ passthrough: true }) res: ElysiaReply): { ok: true } {
    res.header('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
    return { ok: true };
  }

  @Get('combinable')
  combinable(@Res({ passthrough: true }) res: ElysiaReply): { ok: true } {
    res.appendHeader('Vary', 'Origin');
    res.appendHeader('Vary', 'Accept');
    return { ok: true };
  }
}

@Module({ controllers: [FilesController, CookiesController] })
class StreamingCookiesModule {}

describe('e2e: StreamableFile', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [StreamingCookiesModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('streams text content with content-type and content-disposition', async () => {
    const res = await inject(app, { url: '/files/text' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="greeting.txt"');
    expect(await res.text()).toBe('Hello, world!');
  });

  test('streams binary content with the declared type', async () => {
    const res = await inject(app, { url: '/files/binary' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test('streams with explicit content-length', async () => {
    const res = await inject(app, { url: '/files/with-length' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('7');
    expect(await res.text()).toBe('counted');
  });
});

describe('e2e: multi-value Set-Cookie', () => {
  let app: NestElysiaApplication;

  beforeEach(async () => {
    app = await createApp({ modules: [StreamingCookiesModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  test('appendHeader emits each Set-Cookie as a separate header line', async () => {
    const res = await inject(app, { url: '/cookies/multi' });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toEqual([
      'session=abc; Path=/; HttpOnly',
      'theme=dark; Path=/',
      'tracking=xyz; Path=/; SameSite=Lax',
    ]);
  });

  test('header() with an array of cookies emits separate header lines', async () => {
    const res = await inject(app, { url: '/cookies/header-array' });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  test('appendHeader on combinable headers (Vary) keeps comma-join semantics', async () => {
    const res = await inject(app, { url: '/cookies/combinable' });
    expect(res.status).toBe(200);
    expect(res.headers.get('vary')).toBe('Origin, Accept');
  });
});
