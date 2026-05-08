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
      const versionPart = accept.split(';')[1] ?? '';
      const value = versionPart.split(options.key)[1];
      return value === undefined ? VERSION_NEUTRAL : value.trim();
    }
    case VersioningType.HEADER: {
      const value = req.get(options.header);
      return value === undefined ? VERSION_NEUTRAL : value;
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

  const routeList = (Array.isArray(routeVersion) ? routeVersion : [routeVersion]) as string[];
  const requestList = (
    Array.isArray(requestVersion) ? requestVersion : [requestVersion]
  ) as string[];

  return routeList.some((rv) => requestList.includes(rv));
}
