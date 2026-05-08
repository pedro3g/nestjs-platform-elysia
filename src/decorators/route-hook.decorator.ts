import { SetMetadata } from '@nestjs/common';
import { ELYSIA_ROUTE_HOOK_METADATA } from '../constants';

export interface RouteHookOptions {
  parse?: unknown;
  transform?: unknown;
  beforeHandle?: unknown;
  afterHandle?: unknown;
  afterResponse?: unknown;
  mapResponse?: unknown;
  error?: unknown;
}

export const RouteHook = (hooks: RouteHookOptions) =>
  SetMetadata(ELYSIA_ROUTE_HOOK_METADATA, hooks);
