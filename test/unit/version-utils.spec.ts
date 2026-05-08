import { describe, expect, test } from 'bun:test';
import { VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ElysiaRequest } from '../../src/request/elysia-request';
import { extractRequestVersion, versionMatches } from '../../src/utils/version-utils';
import { createMockContext } from '../helpers/mock-context';

const reqWith = (headers: Record<string, string>) =>
  new ElysiaRequest(createMockContext({ headers }));

describe('extractRequestVersion', () => {
  test('HEADER versioning reads custom header', () => {
    const req = reqWith({ 'x-api-version': '2' });
    const v = extractRequestVersion(req, { type: VersioningType.HEADER, header: 'x-api-version' });
    expect(v).toBe('2');
  });

  test('HEADER versioning falls back to VERSION_NEUTRAL when header missing', () => {
    const req = reqWith({});
    const v = extractRequestVersion(req, { type: VersioningType.HEADER, header: 'x-api-version' });
    expect(v).toBe(VERSION_NEUTRAL);
  });

  test('MEDIA_TYPE versioning extracts after key from Accept header', () => {
    const req = reqWith({ accept: 'application/json;v=3' });
    const v = extractRequestVersion(req, { type: VersioningType.MEDIA_TYPE, key: 'v=' });
    expect(v).toBe('3');
  });

  test('MEDIA_TYPE versioning returns VERSION_NEUTRAL when no key matches', () => {
    const req = reqWith({ accept: 'application/json' });
    const v = extractRequestVersion(req, { type: VersioningType.MEDIA_TYPE, key: 'v=' });
    expect(v).toBe(VERSION_NEUTRAL);
  });

  test('CUSTOM versioning calls extractor', () => {
    const req = reqWith({ 'x-tenant': 'acme' });
    const v = extractRequestVersion(req, {
      type: VersioningType.CUSTOM,
      extractor: (r) => (r as ElysiaRequest).get('x-tenant') ?? '',
    });
    expect(v).toBe('acme');
  });

  test('URI versioning returns undefined (Nest handles via path)', () => {
    const req = reqWith({});
    const v = extractRequestVersion(req, {
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    expect(v).toBeUndefined();
  });
});

describe('versionMatches', () => {
  test('VERSION_NEUTRAL routes match every request', () => {
    expect(versionMatches(VERSION_NEUTRAL, '1')).toBe(true);
    expect(versionMatches(VERSION_NEUTRAL, undefined)).toBe(true);
    expect(versionMatches(VERSION_NEUTRAL, VERSION_NEUTRAL)).toBe(true);
  });

  test('exact string match', () => {
    expect(versionMatches('2', '2')).toBe(true);
    expect(versionMatches('2', '1')).toBe(false);
  });

  test('route as array of versions', () => {
    expect(versionMatches(['1', '2'], '2')).toBe(true);
    expect(versionMatches(['1', '2'], '3')).toBe(false);
  });

  test('request as array of versions', () => {
    expect(versionMatches('2', ['1', '2'])).toBe(true);
  });

  test('VERSION_NEUTRAL request never matches a non-NEUTRAL route', () => {
    expect(versionMatches('1', VERSION_NEUTRAL)).toBe(false);
  });

  test('undefined request never matches', () => {
    expect(versionMatches('1', undefined)).toBe(false);
  });
});
