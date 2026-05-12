import { VERSION_NEUTRAL, type VersioningOptions, VersioningType } from '@nestjs/common';
import type { VersionValue } from '@nestjs/common/interfaces';
import type { ElysiaRequest } from '../request/elysia-request';

export function extractRequestVersion(
  req: ElysiaRequest,
  options: VersioningOptions,
): string | string[] | symbol | undefined {
  switch (options.type) {
    case VersioningType.MEDIA_TYPE: {
      const accept = req.get('accept') ?? '';
      const parts = accept.split(',')[0]?.split(';') ?? [];
      const key = options.key;
      for (let i = 1; i < parts.length; i++) {
        const segment = parts[i]!.trim();
        if (segment.startsWith(key)) {
          const value = segment.slice(key.length).trim();
          return value === '' ? VERSION_NEUTRAL : value;
        }
      }
      return VERSION_NEUTRAL;
    }
    case VersioningType.HEADER: {
      const value = req.get(options.header);
      return value === undefined ? VERSION_NEUTRAL : value.trim();
    }
    case VersioningType.CUSTOM: {
      return options.extractor(req as unknown as Record<string, unknown>);
    }
    default:
      return undefined;
  }
}

export function versionMatches(
  routeVersion: VersionValue,
  requestVersion: string | string[] | symbol | undefined,
): boolean {
  if (routeVersion === VERSION_NEUTRAL) return true;
  if (requestVersion === VERSION_NEUTRAL) return false;
  if (requestVersion === undefined) return false;

  const routeIsArray = Array.isArray(routeVersion);
  const requestIsArray = Array.isArray(requestVersion);
  if (!routeIsArray && !requestIsArray) {
    return routeVersion === requestVersion;
  }
  const routeList: readonly string[] = routeIsArray
    ? (routeVersion as string[])
    : [routeVersion as string];
  const requestList: readonly string[] = requestIsArray
    ? (requestVersion as string[])
    : [requestVersion as string];

  return routeList.some((rv) => requestList.includes(rv));
}
