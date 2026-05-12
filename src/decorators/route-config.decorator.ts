import { SetMetadata } from '@nestjs/common';
import { ELYSIA_ROUTE_CONFIG_METADATA } from '../constants';

export interface RouteConfigOptions {
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export const RouteConfig = (config: RouteConfigOptions): MethodDecorator =>
  SetMetadata(ELYSIA_ROUTE_CONFIG_METADATA, config);
