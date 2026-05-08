import { describe, expect, test } from 'bun:test';
import { compilePathMatcher, normalizePath } from '../../src/utils/path-utils';

describe('normalizePath', () => {
  test('adds leading slash', () => {
    expect(normalizePath('cats')).toBe('/cats');
  });

  test('keeps single leading slash', () => {
    expect(normalizePath('/cats')).toBe('/cats');
  });

  test('strips trailing $', () => {
    expect(normalizePath('/cats$')).toBe('/cats');
  });

  test('collapses duplicate slashes', () => {
    expect(normalizePath('//api///cats')).toBe('/api/cats');
  });

  test('empty path becomes /', () => {
    expect(normalizePath('')).toBe('/');
  });

  test('regex paths are stringified', () => {
    expect(normalizePath(/^\/cats/)).toBe('/^\\/cats/');
  });
});

describe('compilePathMatcher', () => {
  test('/ matches everything starting with /', () => {
    const re = compilePathMatcher('/');
    expect(re.test('/')).toBe(true);
    expect(re.test('/anything')).toBe(true);
  });

  test('/cats matches /cats but not /dogs', () => {
    const re = compilePathMatcher('/cats');
    expect(re.test('/cats')).toBe(true);
    expect(re.test('/dogs')).toBe(false);
  });

  test('/users/:id matches with parameter', () => {
    const re = compilePathMatcher('/users/:id');
    expect(re.test('/users/7')).toBe(true);
    expect(re.test('/users/')).toBe(false);
    expect(re.test('/users/7/posts')).toBe(false);
  });

  test('wildcard * matches anything', () => {
    const re = compilePathMatcher('*');
    expect(re.test('/anything')).toBe(true);
    expect(re.test('/a/b/c')).toBe(true);
  });

  test('/files/* matches subpaths', () => {
    const re = compilePathMatcher('/files/*');
    expect(re.test('/files/readme.md')).toBe(true);
    expect(re.test('/files/nested/path')).toBe(true);
  });

  test('invalid pattern falls back to permissive matcher', () => {
    const re = compilePathMatcher('::invalid::');
    expect(re.test('/anything')).toBe(true);
  });
});
