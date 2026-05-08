import { pathToRegexp } from 'path-to-regexp';

export function normalizePath(path: string | RegExp): string {
  if (path instanceof RegExp) return path.toString();
  let normalized = path || '/';
  if (normalized.endsWith('$')) normalized = normalized.slice(0, -1);
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  return normalized;
}

export function compilePathMatcher(path: string): RegExp {
  if (!path || path === '/' || path === '*' || path === '/*') return /^\/.*$/;
  let p = path.replace(/\(\.\*\??\)/g, '*splat').replace(/(?<!\*)\*(?!splat)/g, '*splat');
  if (!p.startsWith('/')) p = `/${p}`;
  try {
    const { regexp } = pathToRegexp(p);
    return regexp;
  } catch {
    return /^.*$/;
  }
}
